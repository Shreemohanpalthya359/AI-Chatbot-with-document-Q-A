import React from 'react';
import { Link } from 'react-router-dom';
import { Bot, FileText, Image as ImageIcon, LineChart, ShieldCheck, Zap } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30">
      
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/10 bg-slate-950/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Bot size={20} className="text-white" />
            </div>
            <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-emerald-400">
              NexusAI
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-sm text-slate-400 hover:text-white transition-colors">Dashboard</Link>
            <Link to="/chat" className="text-sm font-medium px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
              Enter Workspace
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl h-[500px] pointer-events-none">
          <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-[120px] mix-blend-screen"></div>
          <div className="absolute inset-0 bg-teal-500/10 rounded-full blur-[100px] mix-blend-screen translate-x-1/4"></div>
        </div>

        <div className="relative max-w-5xl mx-auto px-6 text-center z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold tracking-wide uppercase mb-8">
            <Zap size={14} /> Powered by Groq Llama 3 & Local Embeddings
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-tight">
            Chat with your documents.<br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-400 via-emerald-400 to-cyan-400">
              Analyze your images.
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            A state-of-the-art AI Workspace featuring Retrieval-Augmented Generation (RAG) and Vision Multi-modality.
            Built for privacy, speed, and accuracy.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/chat" className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white font-semibold shadow-lg shadow-emerald-500/25 transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2">
              <FileText size={20} /> Start Chatting
            </Link>
            <Link to="/dashboard" className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold transition-all flex items-center justify-center gap-2">
              <LineChart size={20} /> View Analytics
            </Link>
          </div>
        </div>
      </main>

      {/* Feature Grid */}
      <section className="py-24 bg-black/40 border-t border-white/5 relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8">
            
            {/* Feature 1 */}
            <div className="p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-emerald-500/30 transition-colors group">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <FileText className="text-emerald-400" size={24} />
              </div>
              <h3 className="text-xl font-bold mb-3 text-slate-200">RAG Document Q&A</h3>
              <p className="text-slate-400 leading-relaxed">
                Upload massive PDFs. We locally embed them in seconds and use Groq's Llama-3 to give you instant, cited answers.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-teal-500/30 transition-colors group">
              <div className="w-12 h-12 rounded-xl bg-teal-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <ImageIcon className="text-teal-400" size={24} />
              </div>
              <h3 className="text-xl font-bold mb-3 text-slate-200">Vision Analysis</h3>
              <p className="text-slate-400 leading-relaxed">
                Need charts or diagrams explained? Attach any image and our Llama-4-Scout vision model provides deep analytical insights.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-cyan-500/30 transition-colors group">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <ShieldCheck className="text-cyan-400" size={24} />
              </div>
              <h3 className="text-xl font-bold mb-3 text-slate-200">Automated Training</h3>
              <p className="text-slate-400 leading-relaxed">
                A background ML pipeline continuously tracks the best metrics (SVM & XGBoost) on your embedded documents.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-white/5 text-center text-slate-500 text-sm">
        <p>Built with Flask, React, and Groq SDK.</p>
      </footer>
    </div>
  );
}
