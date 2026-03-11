import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { ArrowLeft, Database, FileText, MessageSquare, Activity } from 'lucide-react';

const API = 'http://127.0.0.1:5001';

export default function Dashboard() {
  const [stats, setStats] = useState({
    documents: [],
    messages: [],
    training: []
  });
  const [loading, setLoading] = useState(true);

  const [isTraining, setIsTraining] = useState(false);
  const [trainingStatus, setTrainingStatus] = useState(null);

  const fetchDashboardData = async () => {
    try {
      const [docsRes, msgsRes, trainRes, statusRes] = await Promise.all([
        fetch(`${API}/api/documents`),
        fetch(`${API}/api/history?limit=100`),
        fetch(`${API}/api/training-runs`),
        fetch(`${API}/api/train/status`)
      ]);
      
      const docs = await docsRes.json();
      const msgs = await msgsRes.json();
      const train = await trainRes.json();
      const status = await statusRes.json();

      setStats({
        documents: docs.documents || [],
        messages: msgs.messages || [],
        training: train.training_runs || []
      });
      setIsTraining(status.running);
      setTrainingStatus(status.last_result);
    } catch (error) {
      console.error("Dashboard fetch error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    // Poll training status if training is running
    let interval;
    if (isTraining) {
      interval = setInterval(fetchDashboardData, 3000);
    }
    return () => clearInterval(interval);
  }, [isTraining]);

  const handleStartTraining = async () => {
    try {
      setIsTraining(true);
      const res = await fetch(`${API}/api/train`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Training failed to start");
        setIsTraining(false);
      }
    } catch (err) {
      console.error(err);
      setIsTraining(false);
    }
  };

  // Compute aggregate stats
  const totalDocs = stats.documents.length;
  const totalMessages = stats.messages.length;
  
  // Pick the latest training run for the chart
  const latestRun = stats.training.length > 0 ? stats.training[0] : null;
  let chartData = [];
  if (latestRun && latestRun.results_json) {
    try {
      const models = typeof latestRun.results_json === 'string' 
        ? JSON.parse(latestRun.results_json) 
        : latestRun.results_json;
        
      chartData = models.map(m => ({
        name: m.model,
        Accuracy: parseFloat((m.accuracy * 100).toFixed(1))
      }));
    } catch (e) { console.error("Could not parse results_json", e); }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-6 lg:p-10">
      
      {/* Header */}
      <div className="max-w-7xl mx-auto flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold mb-2">Analytics Dashboard</h1>
          <p className="text-slate-400">System overview and ML training metrics.</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleStartTraining}
            disabled={isTraining || totalDocs < 2}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all shadow-lg ${
              isTraining 
                ? "bg-slate-800 text-slate-500 cursor-not-allowed" 
                : "bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:scale-105 active:scale-95 shadow-emerald-500/20"
            }`}
          >
            <Activity size={18} className={isTraining ? "animate-pulse" : ""} />
            {isTraining ? "Training in Progress..." : "Run Analytics Training"}
          </button>
          <Link to="/" className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
            <ArrowLeft size={16} /> Home
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
           <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto space-y-8">
          
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard icon={<FileText />} label="Total Documents" value={totalDocs} color="text-blue-400" bg="bg-blue-500/10" border="border-blue-500/20" />
            <StatCard icon={<MessageSquare />} label="Messages Exchanged" value={totalMessages} color="text-emerald-400" bg="bg-emerald-500/10" border="border-emerald-500/20" />
            <StatCard icon={<Activity />} label="Peak Accuracy" value={latestRun ? `${(latestRun.best_accuracy * 100).toFixed(1)}%` : 'N/A'} color="text-purple-400" bg="bg-purple-500/10" border="border-purple-500/20" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Chart */}
            <div className="lg:col-span-2 p-6 rounded-3xl bg-white/5 border border-white/10 relative overflow-hidden">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Database size={20} className="text-emerald-400" /> Latest ML Model Metrics
              </h2>
              
              {isTraining && (
                <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm z-20 flex flex-col items-center justify-center text-center p-6">
                  <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
                  <h3 className="text-lg font-bold text-emerald-400 mb-1">Training Models...</h3>
                  <p className="text-sm text-slate-400">Analyzing your documents to generate performance benchmarks.</p>
                </div>
              )}

              {chartData.length > 0 ? (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis dataKey="name" stroke="#94a3b8" tick={{fill: '#94a3b8'}} />
                      <YAxis stroke="#94a3b8" tick={{fill: '#94a3b8'}} domain={[0, 100]} />
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.5rem' }}
                        itemStyle={{ color: '#34d399' }}
                      />
                      <Bar dataKey="Accuracy" fill="#10b981" radius={[4, 4, 0, 0]} barSize={50} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-slate-500 border border-dashed border-white/10 rounded-xl bg-black/20">
                  {stats.documents.length >= 2 
                    ? "Click 'Run Analytics Training' to generate performance metrics." 
                    : "Upload at least 2 PDFs and run training to see metrics."}
                </div>
              )}
            </div>

            {/* Recent Documents Table */}
            <div className="p-6 rounded-3xl bg-white/5 border border-white/10 flex flex-col">
              <h2 className="text-lg font-bold mb-4">Recent Documents</h2>
              <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                {stats.documents.length === 0 ? (
                  <p className="text-slate-500 text-sm">No documents uploaded yet.</p>
                ) : (
                  stats.documents.slice(0, 8).map(doc => (
                    <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg bg-black/40 border border-white/5 text-sm">
                      <span className="truncate flex-1 text-slate-300 font-medium" title={doc.filename}>
                        {doc.filename}
                      </span>
                      <span className="text-xs text-slate-500 shrink-0 ml-3">
                        {doc.num_chunks} chunks
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color, bg, border }) {
  return (
    <div className={`p-6 rounded-3xl bg-white/5 border border-white/10 flex items-center gap-5 relative overflow-hidden`}>
       <div className={`absolute top-0 right-0 w-32 h-32 ${bg} rounded-full blur-3xl -translate-y-1/2 translate-x-1/4`}></div>
       <div className={`w-14 h-14 rounded-2xl ${bg} ${border} border flex items-center justify-center ${color} shrink-0 relative z-10`}>
         {icon}
       </div>
       <div className="relative z-10">
         <p className="text-slate-400 text-sm font-medium mb-1">{label}</p>
         <h3 className="text-3xl font-bold text-slate-100">{value}</h3>
       </div>
    </div>
  )
}
