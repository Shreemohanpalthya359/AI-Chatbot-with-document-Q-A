import os
import json
import time
import threading
import shutil
import base64
import jwt
import bcrypt
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

# Document processing imports
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_groq import ChatGroq
from langchain_core.vectorstores import InMemoryVectorStore
from langchain.chains import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate

# ML training module
import trainer

# PostgreSQL database module
import db

load_dotenv()

app = Flask(__name__)
CORS(app)

# ─── Config ───────────────────────────────────────────────────────────────────
load_dotenv()
api_key = os.getenv("GROQ_API_KEY")
JWT_SECRET = os.getenv("JWT_SECRET", "fallback-secret-key")

UPLOAD_FOLDER = "uploads"
EXPORTS_FOLDER = "exports"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(EXPORTS_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# ─── Auth Middleware ─────────────────────────────────────────────────────────

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header.split(" ")[1]

        if not token:
            return jsonify({'message': 'Token is missing!'}), 401

        try:
            data = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            current_user = db.get_user_by_email(data['email'])
            if not current_user:
                return jsonify({'message': 'User not found!'}), 401
        except Exception as e:
            return jsonify({'message': 'Token is invalid!', 'error': str(e)}), 401

        return f(current_user, *args, **kwargs)
    return decorated

@app.route('/exports/<path:filename>')
def serve_export(filename):
    return send_from_directory(EXPORTS_FOLDER, filename)

from langchain_chroma import Chroma

# Global variable for vector store
vector_store = None
EMBEDDINGS_DIR = os.path.join(os.path.dirname(__file__), 'embeddings')

def init_vectorstore():
    global vector_store
    print("Initializing HuggingFaceEmbeddings (this may take a minute on first run)...")
    try:
        # We use a lightweight local embeddings model
        embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        print("Embeddings model loaded successfully.")
        
        # Initialize persistent ChromaDB
        os.makedirs(EMBEDDINGS_DIR, exist_ok=True)
        vector_store = Chroma(
            persist_directory=EMBEDDINGS_DIR,
            embedding_function=embeddings
        )
        print("Chroma VectorStore initialized and loaded from disk.")
    except Exception as e:
        print(f"Error during initialization: {e}")
        raise e

print("App starting, calling init_vectorstore...")
try:
    init_vectorstore()
except Exception as e:
    print("Warning: Could not initialize Chroma InMemoryVectorStore.", e)

# Initialize PostgreSQL tables
try:
    db.init_db()
except Exception as e:
    print(f"Warning: Could not connect to PostgreSQL: {e}")
    print("  → Chat history will not be persisted. Is PostgreSQL running?")

# Global conversation ID (one per server session; extend to per-user later)
_session_conversation_id = None

def _get_or_create_conversation() -> int:
    global _session_conversation_id
    if _session_conversation_id is None:
        try:
            _session_conversation_id = db.create_conversation()
        except Exception:
            pass
    return _session_conversation_id

@app.route('/api/upload', methods=['POST'])
@token_required
def upload_file(current_user):
    if not api_key:
        return jsonify({'error': 'GROQ_API_KEY not configured on server'}), 500

    if 'file' not in request.files:
        return jsonify({'error': 'No file part in request'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    if file and file.filename.endswith('.pdf'):
        filename = secure_filename(file.filename)

        # Save to a temp file — process in memory, never persist to uploads/
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name
        
        try:
            # Load and split from temp file
            loader = PyPDFLoader(tmp_path)
            documents = loader.load()
            
            text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
            chunks = text_splitter.split_documents(documents)
            
            # Embed and store
            global vector_store
            if vector_store is None:
                init_vectorstore()
                
            vector_store.add_documents(chunks)

            # Save only metadata to PostgreSQL — the source file is NOT kept
            try:
                db.save_document(filename, "in-memory", len(chunks))
            except Exception as db_err:
                print(f"[DB] Could not save document metadata: {db_err}")
            
            return jsonify({'message': f'Successfully processed {len(chunks)} embedded chunks from {filename}.'}), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        finally:
            # Always delete the temp file after processing
            try:
                os.remove(tmp_path)
                print(f"[Upload] Temp file deleted: {tmp_path}")
            except Exception:
                pass
    else:
        return jsonify({'error': 'Only PDF files are supported'}), 400

# ─── LLM & RAG chain (built once, reused on every request) ───────────────────
_llm = None
_prompt = None

def _get_llm():
    global _llm
    if _llm is None and api_key:
        # llama-3.1-8b-instant is Groq's fastest model — sub-second latency
        _llm = ChatGroq(model="llama-3.1-8b-instant", api_key=api_key, temperature=0.3)
    return _llm

def _get_prompt():
    global _prompt
    if _prompt is None:
        _prompt = ChatPromptTemplate.from_messages([
            ("system",
             "You are a professional Data Analyst AI. Your task is to extract data from provided PDF context and provide insights.\n\n"
             "DATA VISUALIZATION & FILE GENERATION:\n"
             "- If the user asks for a plot, chart, or graph, you MUST generate Python code using matplotlib or seaborn.\n"
             "- If the user asks for a CSV or Excel file, you MUST generate Python code using pandas.\n"
             "- Wrap your Python code STRICTLY between [PYTHON] and [/PYTHON] tags. Do not use other tags like [PYSHELL].\n"
             "- IMPORTANT: Your code MUST save images as 'exports/temp_plot.png' and files as 'exports/temp_data.csv' or 'exports/temp_data.xlsx'.\n"
             "- Do not show the plot with plt.show(), always use plt.savefig('exports/temp_plot.png').\n\n"
             "CONSTRAINTS:\n"
             "- Do not use any external APIs or sensitive libraries.\n"
             "- Only use pandas, numpy, matplotlib, seaborn, and openpyxl.\n\n"
             "CONTEXT:\n{context}"),
            ("human", "{input}"),
        ])
    return _prompt

def _execute_analysis_code(code: str):
    """Safely executes generated analysis code and returns generated file info."""
    import matplotlib
    matplotlib.use('Agg') # Non-interactive backend
    import matplotlib.pyplot as plt
    import pandas as pd
    import numpy as np
    import seaborn as sns

    local_vars = {
        'pd': pd,
        'np': np,
        'plt': plt,
        'sns': sns
    }
    
    try:
        # Clean up tags if present (handling variants)
        clean_code = code.replace('[PYTHON]', '').replace('[/PYTHON]', '')
        clean_code = clean_code.replace('[PYSHELL]', '').replace('[/PYSHELL]', '')
        clean_code = clean_code.replace('[CODE]', '').replace('[/CODE]', '')
        clean_code = clean_code.strip()
        
        # Execute the code with a controlled global environment
        # We pass an empty dict for globals but include common imports
        exec_globals = {
            'pd': pd,
            'np': np,
            'plt': plt,
            'sns': sns,
            '__builtins__': __import__('builtins')
        }
        exec(clean_code, exec_globals, local_vars)
        plt.close('all') # Cleanup plots
        
        generated_files = []
        # Check what files were generated
        if os.path.exists(EXPORTS_FOLDER):
            for f in os.listdir(EXPORTS_FOLDER):
                if f.startswith('temp_'):
                    generated_files.append(f)
        
        return generated_files
    except Exception as e:
        print(f"Code execution error ERROR: {e}")
        return str(e)

@app.route('/api/chat', methods=['POST'])
@token_required
def chat(current_user):
    if not api_key or vector_store is None:
        return jsonify({'error': 'Server not ready or API key missing'}), 500

    data = request.json
    if not data or 'message' not in data:
        return jsonify({'error': 'No message provided'}), 400

    user_message = data['message']

    # Save user message to DB
    conv_id = _get_or_create_conversation()
    try:
        if conv_id:
            db.save_message(conv_id, 'user', user_message)
    except Exception as db_err:
        print(f"[DB] Could not save user message: {db_err}")

    try:
        llm = _get_llm()
        retriever = vector_store.as_retriever(search_kwargs={"k": 3})
        question_answer_chain = create_stuff_documents_chain(llm, _get_prompt())
        rag_chain = create_retrieval_chain(retriever, question_answer_chain)

        response = rag_chain.invoke({"input": user_message})
        answer = response['answer']
        
        # Check for code block in response (flexible matching)
        plot_url = None
        file_url = None
        
        tags = ['[PYTHON]', '[PYSHELL]', '[CODE]']
        message_has_code = any(tag in answer for tag in tags)

        if message_has_code:
            import re
            # Try to catch code between any of our tags
            code_match = re.search(r'\[(?:PYTHON|PYSHELL|CODE)\](.*?)\[\/(?:PYTHON|PYSHELL|CODE)\]', answer, re.DOTALL)
            
            # If no closing tag, try just catching everything after the opening tag
            if not code_match:
                code_match = re.search(r'\[(?:PYTHON|PYSHELL|CODE)\](.*)', answer, re.DOTALL)

            if code_match:
                code = code_match.group(1).strip()
                # Clear previous temp files before execution
                for f in os.listdir(EXPORTS_FOLDER):
                    if f.startswith('temp_'):
                        try: os.remove(os.path.join(EXPORTS_FOLDER, f))
                        except: pass
                
                exec_result = _execute_analysis_code(code)
                
                if isinstance(exec_result, list):
                    for f in exec_result:
                        if f.endswith('.png'):
                            plot_url = f"/exports/{f}"
                        else:
                            file_url = f"/exports/{f}"
                
                # Clean the answer text to remove the code blocks from display
                # but keep the textual explanation
                answer = re.sub(r'\[(?:PYTHON|PYSHELL|CODE)\].*?\[\/(?:PYTHON|PYSHELL|CODE)\]', '', answer, flags=re.DOTALL)
                answer = re.sub(r'\[(?:PYTHON|PYSHELL|CODE)\].*', '', answer, flags=re.DOTALL)
                answer = answer.strip()

        # Save bot response to DB
        try:
            if conv_id:
                db.save_message(conv_id, 'bot', answer)
        except Exception as db_err:
            print(f"[DB] Could not save bot message: {db_err}")

        return jsonify({
            'response': answer,
            'plot_url': plot_url,
            'file_url': file_url,
            'sources': [doc.metadata.get('source', 'Unknown') for doc in response.get('context', [])]
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ─── Image Analysis ───────────────────────────────────────────────────────────
import base64
from groq import Groq as GroqClient

ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/gif', 'image/webp'}

@app.route('/api/analyze-image', methods=['POST'])
@token_required
def analyze_image(current_user):
    """
    Accepts an image upload + optional question, and uses Groq's vision model
    (llama-4-scout-17b) to analyze the image content.
    """
    if not api_key:
        return jsonify({'error': 'GROQ_API_KEY not configured'}), 500

    if 'image' not in request.files:
        return jsonify({'error': 'No image in request'}), 400

    image_file = request.files['image']
    question   = request.form.get('question', 'Describe this image in detail.')

    if image_file.content_type not in ALLOWED_IMAGE_TYPES:
        return jsonify({'error': 'Unsupported image type. Use JPEG, PNG, GIF, or WebP.'}), 400

    try:
        # Read & base64-encode the image
        image_bytes  = image_file.read()
        image_b64    = base64.b64encode(image_bytes).decode('utf-8')
        media_type   = image_file.content_type

        # Use Groq's vision model via the native client (supports multimodal)
        client = GroqClient(api_key=api_key)
        completion = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{media_type};base64,{image_b64}"
                            }
                        },
                        {
                            "type": "text",
                            "text": question
                        }
                    ]
                }
            ],
            max_tokens=1024,
            temperature=0.3,
        )

        answer = completion.choices[0].message.content
        return jsonify({'response': answer, 'type': 'image_analysis'}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


training_state = {"running": False, "last_result": None}

def _run_training_bg():
    """Run training in background so the API request returns immediately."""
    training_state["running"] = True
    training_state["last_result"] = None
    try:
        result = trainer.run_training(upload_folder=UPLOAD_FOLDER)
        training_state["last_result"] = result
        # Persist training run to PostgreSQL
        if result and 'error' not in result:
            try:
                db.save_training_run(result)
                print("[DB] Training run saved to database.")
            except Exception as db_err:
                print(f"[DB] Could not save training run: {db_err}")
    except Exception as e:
        training_state["last_result"] = {"error": str(e)}
    finally:
        training_state["running"] = False

@app.route('/api/train', methods=['POST'])
@token_required
def train_models(current_user):
    """
    Triggers the ML training pipeline on all uploaded PDFs.
    Training output is printed to the terminal.
    """
    if training_state["running"]:
        return jsonify({"message": "Training already in progress. Check terminal output."}), 202

    # Count PDFs in upload folder
    pdf_files = [f for f in os.listdir(UPLOAD_FOLDER) if f.endswith('.pdf')]
    if len(pdf_files) < 2:
        return jsonify({
            "error": f"Need at least 2 PDFs for classification training. "
                     f"Currently have {len(pdf_files)} uploaded."
        }), 400

    t = threading.Thread(target=_run_training_bg, daemon=True)
    t.start()

    return jsonify({
        "message": (
            f"✅ Training started on {len(pdf_files)} document(s). "
            f"Watch your terminal for live progress and metrics!"
        ),
        "documents": pdf_files,
    }), 200

@app.route('/api/train/status', methods=['GET'])
def train_status():
    """Returns current training status and last result if done."""
    return jsonify({
        "running": training_state["running"],
        "last_result": training_state["last_result"],
    }), 200


# ─── Auth Endpoints ──────────────────────────────────────────────────────────

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400

    if db.get_user_by_email(email):
        return jsonify({'error': 'User already exists'}), 400

    hashed_pw = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    try:
        db.create_user(email, hashed_pw)
        return jsonify({'message': 'User registered successfully'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400

    user = db.get_user_by_email(email)
    if not user or not bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
        return jsonify({'error': 'Invalid credentials'}), 401

    token = jwt.encode({
        'user_id': user['id'],
        'email': user['email'],
        'exp': datetime.utcnow() + timedelta(hours=24)
    }, JWT_SECRET, algorithm="HS256")

    return jsonify({
        'token': token,
        'user': {'id': user['id'], 'email': user['email']}
    }), 200

# ─── PostgreSQL Read Endpoints ────────────────────────────────────────────────

@app.route('/api/history', methods=['GET'])
@token_required
def get_history(current_user):
    """Returns recent chat messages stored in PostgreSQL."""
    limit = request.args.get('limit', 50, type=int)
    try:
        messages = db.get_recent_messages(limit=limit)
        return jsonify({'messages': messages, 'count': len(messages)}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/documents', methods=['GET'])
@token_required
def get_documents(current_user):
    """Returns all uploaded documents stored in PostgreSQL."""
    try:
        docs = db.get_documents()
        return jsonify({'documents': docs, 'count': len(docs)}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/training-runs', methods=['GET'])
@token_required
def get_training_runs(current_user):
    """Returns all ML training runs stored in PostgreSQL."""
    try:
        runs = db.get_training_runs()
        return jsonify({'training_runs': runs, 'count': len(runs)}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500



@app.route('/api/profile', methods=['GET'])
@token_required
def get_profile(current_user):
    """Returns the current user's profile data."""
    try:
        # Aggregate stats for the user
        docs = db.get_documents()
        runs = db.get_training_runs()
        messages = db.get_recent_messages(limit=1000)

        return jsonify({
            'user': {
                'id': current_user['id'],
                'email': current_user['email'],
                'created_at': current_user['created_at'].isoformat() if current_user.get('created_at') else None,
                'name': current_user.get('name', current_user['email'].split('@')[0]),
            },
            'stats': {
                'documents_uploaded': len(docs),
                'training_runs': len(runs),
                'messages_sent': len([m for m in messages if m['role'] == 'human']),
                'best_accuracy': max([r['best_accuracy'] for r in runs], default=0),
            }
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/profile/update', methods=['PUT'])
@token_required
def update_profile(current_user):
    """Updates the user's name and/or password."""
    data = request.json
    new_name = data.get('name')
    new_password = data.get('new_password')
    current_password = data.get('current_password')

    try:
        conn = db.get_connection()
        with conn.cursor() as cur:
            if new_name:
                cur.execute("UPDATE users SET name = %s WHERE id = %s;", (new_name, current_user['id']))

            if new_password and current_password:
                if not bcrypt.checkpw(current_password.encode('utf-8'), current_user['password_hash'].encode('utf-8')):
                    return jsonify({'error': 'Current password is incorrect'}), 400
                new_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                cur.execute("UPDATE users SET password_hash = %s WHERE id = %s;", (new_hash, current_user['id']))

        return jsonify({'message': 'Profile updated successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("Starting Flask server on http://0.0.0.0:5001")
    app.run(host='0.0.0.0', port=5001, debug=False)
