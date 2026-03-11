import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Mail, Lock, Shield, FileText, Brain, MessageSquare,
  BarChart2, ArrowLeft, Save, Eye, EyeOff, CheckCircle,
  AlertCircle, Edit3, Star, Calendar, Zap, ChevronRight,
  LogOut, Settings, TrendingUp
} from 'lucide-react';

const API = 'http://127.0.0.1:5001';

const StatCard = ({ icon: Icon, label, value, color, suffix = '' }) => (
  <div className="group relative bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/10 hover:border-white/20 transition-all duration-300 cursor-default overflow-hidden">
    <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br ${color} rounded-2xl`} style={{opacity: 0.05}} />
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-gradient-to-br ${color}`}>
      <Icon className="w-5 h-5 text-white" />
    </div>
    <div className="text-2xl font-bold text-white mb-1">
      {typeof value === 'number' ? (suffix === '%' ? `${(value * 100).toFixed(1)}%` : value) : value}
    </div>
    <div className="text-gray-400 text-sm">{label}</div>
  </div>
);

const UserProfile = ({ onLogout }) => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Edit form state
  const [editName, setEditName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setProfile(data.user);
        setStats(data.stats);
        setEditName(data.user.name || data.user.email.split('@')[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (newPassword && newPassword !== confirmPassword) {
      setSaveStatus('error');
      setSaveMessage('New passwords do not match!');
      return;
    }

    setSaving(true);
    setSaveStatus(null);
    try {
      const payload = { name: editName };
      if (newPassword && currentPassword) {
        payload.current_password = currentPassword;
        payload.new_password = newPassword;
      }

      const res = await fetch(`${API}/api/profile/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        setSaveStatus('success');
        setSaveMessage('Profile updated successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        fetchProfile();
      } else {
        setSaveStatus('error');
        setSaveMessage(data.error || 'Update failed');
      }
    } catch (err) {
      setSaveStatus('error');
      setSaveMessage('Network error');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus(null), 4000);
    }
  };

  const initials = profile
    ? (profile.name || profile.email)
        .split(' ')
        .map(w => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  const joinedDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'N/A';

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart2 },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'security', label: 'Security', icon: Shield },
  ];

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white font-sans">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-8">
        {/* Header Nav */}
        <div className="flex items-center justify-between mb-10">
          <button
            onClick={() => navigate('/chat')}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm">Back to Chat</span>
          </button>
          <nav className="flex items-center gap-1">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 text-sm transition-all"
            >
              <BarChart2 className="w-4 h-4" />
              Dashboard
            </button>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 text-sm transition-all"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </nav>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-400">Loading your profile...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Profile Hero */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 mb-6 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-teal-500/10 via-violet-500/5 to-transparent" />
              <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-6">
                {/* Avatar */}
                <div className="relative">
                  <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-teal-400 to-violet-500 flex items-center justify-center text-3xl font-bold text-white shadow-2xl">
                    {initials}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-400 rounded-full border-2 border-[#0a0f1e] flex items-center justify-center">
                    <div className="w-2 h-2 bg-green-800 rounded-full" />
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 text-center sm:text-left">
                  <h1 className="text-3xl font-bold text-white mb-1">
                    {profile?.name || profile?.email?.split('@')[0]}
                  </h1>
                  <div className="flex items-center justify-center sm:justify-start gap-2 text-gray-400 mb-3">
                    <Mail className="w-4 h-4" />
                    <span className="text-sm">{profile?.email}</span>
                  </div>
                  <div className="flex items-center justify-center sm:justify-start gap-4 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-teal-400 bg-teal-400/10 border border-teal-400/20 px-3 py-1 rounded-full">
                      <Zap className="w-3 h-3" />
                      Pro User
                    </span>
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Calendar className="w-3 h-3" />
                      Joined {joinedDate}
                    </span>
                  </div>
                </div>

                {/* Quick Stats Summary */}
                {stats && (
                  <div className="flex sm:flex-col items-end gap-3">
                    <div className="text-right">
                      <div className="text-2xl font-bold text-teal-400">
                        {stats.best_accuracy > 0 ? `${(stats.best_accuracy * 100).toFixed(0)}%` : '—'}
                      </div>
                      <div className="text-xs text-gray-500">Best ML Accuracy</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Stats Grid */}
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard
                  icon={FileText}
                  label="Documents Uploaded"
                  value={stats.documents_uploaded}
                  color="from-blue-500 to-cyan-500"
                />
                <StatCard
                  icon={MessageSquare}
                  label="Questions Asked"
                  value={stats.messages_sent}
                  color="from-teal-500 to-green-500"
                />
                <StatCard
                  icon={Brain}
                  label="Training Runs"
                  value={stats.training_runs}
                  color="from-violet-500 to-purple-500"
                />
                <StatCard
                  icon={TrendingUp}
                  label="Best SVM Accuracy"
                  value={stats.best_accuracy}
                  color="from-orange-500 to-rose-500"
                  suffix="%"
                />
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 bg-white/5 border border-white/10 rounded-2xl p-1 mb-6">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition-all ${
                    activeTab === id
                      ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/20'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'overview' && (
              <div className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-5">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <Star className="w-5 h-5 text-teal-400" />
                  Account Overview
                </h2>
                <div className="grid gap-3">
                  {[
                    { label: 'Display Name', value: profile?.name || profile?.email?.split('@')[0], icon: User },
                    { label: 'Email Address', value: profile?.email, icon: Mail },
                    { label: 'Account ID', value: `#${profile?.id}`, icon: Shield },
                    { label: 'Member Since', value: joinedDate, icon: Calendar },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-white/10 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-teal-500/10 rounded-lg flex items-center justify-center">
                          <Icon className="w-4 h-4 text-teal-400" />
                        </div>
                        <span className="text-sm text-gray-400">{label}</span>
                      </div>
                      <span className="text-sm text-white font-medium">{value}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-6 border-t border-white/10">
                  <h3 className="text-sm font-medium text-gray-400 mb-4 uppercase tracking-wider">Quick Actions</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Go to Chat', icon: MessageSquare, path: '/chat', color: 'hover:border-teal-400/30 hover:bg-teal-400/5' },
                      { label: 'View Dashboard', icon: BarChart2, path: '/dashboard', color: 'hover:border-violet-400/30 hover:bg-violet-400/5' },
                      { label: 'Edit Profile', icon: Edit3, tab: 'settings', color: 'hover:border-blue-400/30 hover:bg-blue-400/5' },
                    ].map(({ label, icon: Icon, path, tab, color }) => (
                      <button
                        key={label}
                        onClick={() => path ? navigate(path) : setActiveTab(tab)}
                        className={`flex flex-col items-center gap-2 p-4 bg-white/5 border border-white/10 rounded-2xl text-gray-400 hover:text-white transition-all ${color}`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="text-xs font-medium">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-6">
                  <Edit3 className="w-5 h-5 text-teal-400" />
                  Edit Profile
                </h2>

                <form onSubmit={handleSave} className="space-y-5">
                  {/* Display Name */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Display Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Your display name"
                        className="w-full bg-white/5 border border-white/10 focus:border-teal-500/50 rounded-xl py-3 pl-10 pr-4 text-white outline-none transition-all placeholder:text-gray-600"
                      />
                    </div>
                  </div>

                  {/* Email (read-only) */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Email Address <span className="text-gray-600 text-xs">(cannot be changed)</span></label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="email"
                        value={profile?.email || ''}
                        readOnly
                        className="w-full bg-white/3 border border-white/5 rounded-xl py-3 pl-10 pr-4 text-gray-500 outline-none cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* Save Status */}
                  {saveStatus && (
                    <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${
                      saveStatus === 'success'
                        ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                        : 'bg-red-500/10 border border-red-500/20 text-red-400'
                    }`}>
                      {saveStatus === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                      {saveMessage}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-400 hover:to-teal-500 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-teal-500/20"
                  >
                    {saving ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </form>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-6">
                  <Shield className="w-5 h-5 text-teal-400" />
                  Security Settings
                </h2>

                <form onSubmit={handleSave} className="space-y-5">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Current Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type={showCurrentPw ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter current password"
                        className="w-full bg-white/5 border border-white/10 focus:border-teal-500/50 rounded-xl py-3 pl-10 pr-12 text-white outline-none transition-all placeholder:text-gray-600"
                      />
                      <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                        {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type={showNewPw ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                        className="w-full bg-white/5 border border-white/10 focus:border-teal-500/50 rounded-xl py-3 pl-10 pr-12 text-white outline-none transition-all placeholder:text-gray-600"
                      />
                      <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                        {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Confirm New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        className={`w-full bg-white/5 border rounded-xl py-3 pl-10 pr-4 text-white outline-none transition-all placeholder:text-gray-600 ${
                          confirmPassword && confirmPassword !== newPassword
                            ? 'border-red-500/50 focus:border-red-500'
                            : 'border-white/10 focus:border-teal-500/50'
                        }`}
                      />
                    </div>
                    {confirmPassword && confirmPassword !== newPassword && (
                      <p className="text-red-400 text-xs mt-1">Passwords do not match</p>
                    )}
                  </div>

                  {/* Security notices */}
                  <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl space-y-2">
                    <p className="text-xs text-gray-400 font-medium">🔐 Security Tips</p>
                    <ul className="text-xs text-gray-500 space-y-1">
                      <li>• Use at least 8 characters with mixed case and numbers</li>
                      <li>• Your session uses JWT tokens valid for 24 hours</li>
                      <li>• You will need to log in again after changing your password</li>
                    </ul>
                  </div>

                  {saveStatus && (
                    <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${
                      saveStatus === 'success'
                        ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                        : 'bg-red-500/10 border border-red-500/20 text-red-400'
                    }`}>
                      {saveStatus === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                      {saveMessage}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={saving || !currentPassword || !newPassword || newPassword !== confirmPassword}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-400 hover:to-violet-500 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-40 shadow-lg shadow-violet-500/20"
                  >
                    {saving ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Shield className="w-4 h-4" />
                    )}
                    {saving ? 'Updating...' : 'Update Password'}
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default UserProfile;
