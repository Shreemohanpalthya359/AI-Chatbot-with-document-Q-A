import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Image as ImageIcon, Send, ArrowLeft, Mic, MicOff, Volume2, Square, LogOut } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const API = 'http://127.0.0.1:5001';

function ChatWorkspace({ onLogout }) {
  const token = localStorage.getItem('token');
  const [messages, setMessages] = useState([
    { id: 1, role: 'bot', text: 'Hello! Upload a PDF to start asking questions, or attach an image to analyze it.' }
  ]);
  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  // Image attachment state
  const [attachedImage, setAttachedImage] = useState(null);      // { file, preview }
  const imageInputRef = useRef(null);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages, isTyping]);

  // ── Voice Input (Speech-to-Text) ──────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    // Initialize Web Speech API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      
      recognitionRef.current.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
           setInput(prev => prev + (prev ? ' ' : '') + finalTranscript);
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.error("Speech recognition error", event.error);
        setIsRecording(false);
      };
      
      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };
    }
    
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
    }
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      if (!recognitionRef.current) {
        alert("Your browser does not support Speech Recognition. Try Chrome or Edge.");
        return;
      }
      setInput(''); // Clear input when starting fresh voice command
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  // ── Voice Output (Text-to-Speech) ─────────────────────────────────────────
  const [playingMessageId, setPlayingMessageId] = useState(null);

  const toggleSpeech = (id, text) => {
    if (playingMessageId === id) {
      window.speechSynthesis.cancel();
      setPlayingMessageId(null);
    } else {
      window.speechSynthesis.cancel(); // Stop any current speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => setPlayingMessageId(null);
      utterance.onerror = () => setPlayingMessageId(null);
      setPlayingMessageId(id);
      window.speechSynthesis.speak(utterance);
    }
  };

  // Clean up speech on unmount
  useEffect(() => {
    return () => window.speechSynthesis.cancel();
  }, []);

  // ── PDF upload ────────────────────────────────────────────────────────────
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || file.type !== 'application/pdf') { alert('Please upload a valid PDF.'); return; }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res  = await fetch(`${API}/api/upload`, { 
        method: 'POST', 
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData 
      });
      
      if (res.status === 401) return onLogout();
      
      const data = await res.json();
      setMessages(prev => [...prev, {
        id: Date.now(), role: 'bot',
        text: res.ok
          ? `✅ Analyzed "${file.name}". What would you like to know?`
          : `Error: ${data.error || 'Upload failed'}`
      }]);
    } catch {
      setMessages(prev => [...prev, { id: Date.now(), role: 'bot', text: 'Connection error. Is the backend running?' }]);
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  // ── Image attachment picker ───────────────────────────────────────────────
  const handleImageAttach = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setAttachedImage({ file, preview });
    e.target.value = '';
  };

  const clearAttachedImage = () => {
    if (attachedImage?.preview) URL.revokeObjectURL(attachedImage.preview);
    setAttachedImage(null);
  };

  // ── Send (text or image) ─────────────────────────────────────────────────
  const handleSend = async () => {
    if (!input.trim() && !attachedImage) return;

    const userText    = input.trim();
    const imageToSend = attachedImage;

    // Optimistic UI
    setMessages(prev => [
      ...prev,
      {
        id: Date.now(), role: 'user', text: userText || '🖼️ Analyzing image...',
        image: imageToSend?.preview || null
      }
    ]);
    setInput('');
    clearAttachedImage();
    setIsTyping(true);

    try {
      let res, data;

      if (imageToSend) {
        // ── Vision request ────────────────────────────────────────────────
        const formData = new FormData();
        formData.append('image', imageToSend.file);
        formData.append('question', userText || 'Describe this image in detail.');
        res  = await fetch(`${API}/api/analyze-image`, { 
          method: 'POST', 
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData 
        });
        if (res.status === 401) return onLogout();
        data = await res.json();
      } else {
        // ── RAG chat request ──────────────────────────────────────────────
        res  = await fetch(`${API}/api/chat`, {
          method: 'POST', 
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ message: userText }),
        });
        if (res.status === 401) return onLogout();
        data = await res.json();
      }

      setMessages(prev => [...prev, {
        id: Date.now(), role: 'bot',
        text: res.ok ? data.response : `Error: ${data.error || 'Request failed'}`,
        plot: data.plot_url ? `${API}${data.plot_url}` : null,
        file: data.file_url ? `${API}${data.file_url}` : null,
      }]);
    } catch {
      setMessages(prev => [...prev, { id: Date.now(), role: 'bot', text: 'Connection error. Please check if the backend is running.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="h-screen w-full bg-slate-950 text-slate-100 flex font-sans bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black overflow-hidden relative">
      
      {/* Main Glass Container */}
      <div className="w-full h-full flex flex-col md:flex-row relative z-10 bg-white/[0.02] backdrop-blur-sm">
        
        {/* Glow Effects */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl"></div>
        </div>

        {/* Sidebar / Document Upload Panel */}
        <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-white/10 bg-black/40 p-6 flex flex-col shrink-0 z-20 shadow-xl shadow-black/50">
          
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                  <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-emerald-400">AI Analyst</h2>
            </div>
            
            <Link to="/" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors" title="Back to Home">
              <ArrowLeft size={18} />
            </Link>
          </div>
          
          <div className="flex-1 flex flex-col justify-center gap-4">
            <p className="text-sm text-slate-400 px-2 text-center">Add a knowledge base to start querying your documents.</p>
            
            <label className="relative w-full aspect-square md:aspect-auto md:h-64 border-2 border-dashed border-white/20 rounded-2xl flex flex-col items-center justify-center p-6 text-center text-slate-400 hover:border-emerald-400/50 hover:bg-emerald-400/5 hover:text-emerald-300 transition-all duration-300 cursor-pointer group overflow-hidden">
              <input 
                type="file" 
                accept=".pdf" 
                className="hidden" 
                onChange={handleFileUpload}
                disabled={isUploading}
              />
              
              {isUploading ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
                  <p className="text-sm font-medium text-emerald-400 animate-pulse">Processing PDF...</p>
                </div>
              ) : (
                <>
                  <div className="p-4 bg-white/5 rounded-full mb-4 group-hover:scale-110 transition-transform duration-300">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 group-hover:text-emerald-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold">Upload PDF</p>
                  <p className="text-xs mt-2 opacity-60 px-4">Click here or drag and drop your file</p>
                </>
              )}
            </label>
          </div>
          
          <div className="mt-8 pt-6 border-t border-white/5 space-y-2">
            <button
               onClick={() => navigate('/profile')}
               className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/20 transition-all group"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              <span className="font-semibold text-sm">My Profile</span>
            </button>
            <button
               onClick={onLogout}
               className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all group"
            >
              <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" />
              <span className="font-semibold text-sm">Sign Out</span>
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-500 justify-center bg-black/20 py-2 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Powered by Groq & LangChain
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col relative z-10 bg-gradient-to-br from-transparent to-black/20">

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scroll-smooth">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                <div className={`flex items-end gap-2 max-w-[85%] sm:max-w-[75%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  
                  {/* Avatar */}
                  <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs shadow-sm ${
                    msg.role === 'user' 
                    ? 'bg-gradient-to-br from-teal-500 to-emerald-600 outline outline-2 outline-offset-2 outline-emerald-500/30' 
                    : 'bg-slate-800 border border-white/10'
                  }`}>
                    {msg.role === 'user' ? 'U' : 'AI'}
                  </div>

                  {/* Message Bubble */}
                  <div className={`group/bubble relative px-5 py-4 shadow-md backdrop-blur-sm prose prose-invert prose-sm ${
                    msg.role === 'user' 
                    ? 'bg-gradient-to-br from-teal-600 to-emerald-600 text-white rounded-2xl rounded-br-sm' 
                    : 'bg-white/10 border border-white/10 text-slate-200 rounded-2xl rounded-bl-sm'
                  }`}>
                    {/* TTS Button (Only for Bot) */}
                    {msg.role === 'bot' && (
                      <button 
                        onClick={() => toggleSpeech(msg.id, msg.text)}
                        title={playingMessageId === msg.id ? "Stop reading" : "Read aloud"}
                        className={`absolute -right-10 top-2 p-1.5 rounded-lg border border-white/10 backdrop-blur-md transition-all ${
                          playingMessageId === msg.id 
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 opacity-100" 
                            : "bg-black/40 text-slate-400 opacity-0 group-hover/bubble:opacity-100 hover:text-white hover:bg-white/10"
                        }`}
                      >
                        {playingMessageId === msg.id ? <Square size={14} className="fill-emerald-400" /> : <Volume2 size={14} />}
                      </button>
                    )}
                    <div className={`leading-relaxed m-0 whitespace-normal break-words prose prose-sm max-w-none ${
                        msg.role === 'user' ? 'prose-invert' : 'prose-invert prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0'
                      }`}
                    >
                      <ReactMarkdown>
                        {msg.text}
                      </ReactMarkdown>
                    </div>

                    {/* AI Generated Plot */}
                    {msg.plot && (
                      <div className="mt-4 rounded-xl overflow-hidden border border-white/20 bg-black/20 shadow-inner">
                        <img 
                          src={msg.plot} 
                          alt="AI Analysis Plot" 
                          className="w-full h-auto object-contain cursor-zoom-in hover:scale-[1.02] transition-transform duration-300"
                          onClick={() => window.open(msg.plot, '_blank')}
                        />
                        <div className="px-3 py-1.5 bg-black/40 text-[10px] text-slate-400 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          AI Generated Visualization
                        </div>
                      </div>
                    )}

                    {/* AI Generated Data File */}
                    {msg.file && (
                      <div className="mt-4">
                        <a 
                          href={msg.file} 
                          download 
                          className="flex items-center gap-3 px-4 py-3 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-emerald-500/50 rounded-xl text-sm transition-all group/file"
                        >
                          <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg group-hover/file:scale-110 transition-transform">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-slate-200">Generated Dataset</div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider">{msg.file.split('.').pop()} FILE</div>
                          </div>
                          <div className="text-emerald-400 opacity-0 group-hover/file:opacity-100 transition-opacity">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </div>
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {/* Typing Indicator */}
            {isTyping && (
              <div className="flex justify-start animate-in fade-in duration-300">
                 <div className="flex items-end gap-2 max-w-[85%]">
                  <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs shadow-sm bg-slate-800 border border-white/10">AI</div>
                  <div className="px-5 py-4 shadow-md bg-white/5 border border-white/5 rounded-2xl rounded-bl-sm flex items-center gap-1.5 h-12">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce"></div>
                  </div>
                 </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 sm:p-6 bg-slate-950/80 border-t border-white/10 backdrop-blur-xl">
            
            {/* Image preview strip */}
            {attachedImage && (
              <div className="mb-3 flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-2 w-fit">
                <img src={attachedImage.preview} alt="attached" className="w-12 h-12 object-cover rounded-lg border border-white/20" />
                <span className="text-xs text-slate-400">Image attached — ask a question</span>
                <button onClick={clearAttachedImage} className="text-slate-500 hover:text-red-400 transition-colors text-lg leading-none ml-2">×</button>
              </div>
            )}

            <div className="relative flex items-center group gap-2 max-w-4xl mx-auto">
              {/* Image attach button */}
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={isTyping}
                title="Attach an image to analyze"
                className="shrink-0 p-4 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-emerald-400 rounded-2xl transition-all disabled:opacity-40"
              >
                <ImageIcon size={22} />
              </button>
              <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageAttach} />

              <div className="relative flex-1 flex items-center">
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  disabled={isTyping}
                  placeholder={attachedImage ? "Ask about the image (optional)..." : "Ask a question about the document..."} 
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 focus:border-emerald-500/50 text-white rounded-2xl pl-6 pr-[120px] py-4 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 shadow-inner transition-all placeholder:text-slate-500 disabled:opacity-50 text-base"
                />
                
                {/* Actions container inside the input box */}
                <div className="absolute right-2 flex items-center gap-2">
                  
                  {/* Voice Record Button */}
                  <button
                    onClick={toggleRecording}
                    disabled={isTyping}
                    title={isRecording ? "Stop recording" : "Start voice command"}
                    className={`p-2.5 rounded-xl transition-all shadow-lg ${
                      isRecording 
                        ? "bg-red-500 hover:bg-red-400 text-white animate-pulse shadow-red-500/20" 
                        : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-transparent"
                    }`}
                  >
                    {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
                  </button>
                  
                  {/* Send Button */}
                  <button 
                    onClick={handleSend}
                    disabled={(!input.trim() && !attachedImage) || isTyping}
                    className="p-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl shadow-lg shadow-emerald-500/20 transition-all transform active:scale-95"
                  >
                    <Send size={20} />
                  </button>
                </div>
              </div>
            </div>
            <p className="text-center text-[10px] text-slate-500 mt-4 font-medium tracking-wide">AI CAN MAKE MISTAKES. VERIFY IMPORTANT INFORMATION.</p>
          </div>
        </div>
        
      </div>
    </div>
  );
}

export default ChatWorkspace;

