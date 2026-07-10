import { useState, useEffect } from 'react';
import { Camera, StopCircle, RefreshCw, MonitorPlay, Focus, Image as ImageIcon, AppWindow, ShieldAlert, Monitor, LayoutGrid, LogOut } from 'lucide-react';
import { getBackendUrl } from './config';
import './App.css';
import './index.css';

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  
  // UI States
  const [activeTab, setActiveTab] = useState<'capture' | 'record'>('record');
  const [recordMode, setRecordMode] = useState<'this-tab' | 'desktop'>('this-tab');
  const [activeWorkspace, setActiveWorkspace] = useState<string>('');
  const [tabSound, setTabSound] = useState(true);
  const [controlBar, setControlBar] = useState(true);

  useEffect(() => {
    // Check initial recording state and Auth session
    chrome.storage.local.get(['reportr_session'], (result) => {
      const sessionData = result.reportr_session as any;
      if (sessionData) {
        setSession(sessionData);
        if (sessionData.workspaces && sessionData.workspaces.length > 0) {
          setActiveWorkspace(sessionData.workspaces[0].id);
        }
      }

      chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
        if (response) {
          setIsRecording(response.isRecording);
        }
      });

      if (sessionData) {
        // Ask the background whether the token is still valid (it will silently
        // refresh if it can). If not, we surface a sign-in prompt.
        chrome.runtime.sendMessage({ action: 'checkAuth' }, (res) => {
          setSessionExpired(!(res && res.valid));
          setIsValidating(false);
        });
      } else {
        setIsValidating(false);
      }
    });
  }, []);

  const handleStart = () => {
    // We send activeWorkspace back if we want background.ts to use it
    // Right now, background.ts assumes the DB upload will use active context.
    // For now, let's just start recording.
    chrome.runtime.sendMessage({ 
      action: 'startRecording', 
      workspaceId: activeWorkspace,
      recordMode: recordMode
    }, (response) => {
      if (response && response.status === 'started') {
        setIsRecording(true);
      }
    });
  };

  const handleStop = () => {
    chrome.runtime.sendMessage({ action: 'stopRecording' });
    setIsRecording(false);
  };

  const handleCapture = (type: 'visible' | 'full' | 'selected') => {
    chrome.runtime.sendMessage({
      action: 'startCapture',
      captureType: type,
      workspaceId: activeWorkspace
    });
    window.close();
  };

  const openWebLogin = async () => {
    // Use the origin the session was last synced from (e.g. localhost during
    // dev), falling back to the packaged default for first-time users.
    const base = await getBackendUrl();
    chrome.tabs.create({ url: base });
  };

  const openDashboard = async () => {
    const base = await getBackendUrl();
    chrome.tabs.create({ url: `${base}/dashboard` });
    window.close();
  };

  const handleSignOut = () => {
    // Clear the synced session locally. The web dashboard keeps its own session;
    // this just disconnects the extension until the user visits the dashboard
    // again (which re-syncs via AuthSync).
    chrome.storage.local.remove(['reportr_session'], () => {
      setSession(null);
      setSessionExpired(false);
    });
  };

  if (isValidating) {
    return (
      <div className="w-[360px] h-[520px] bg-[#f9f9fb] flex flex-col justify-center items-center text-zinc-800">
        <RefreshCw className="animate-spin text-zinc-400 mb-4" size={24} />
      </div>
    );
  }

  // --- Unauthenticated / Expired State ---
  if (!session || sessionExpired) {
    const expired = !!session && sessionExpired;
    return (
      <div className="w-[360px] h-[520px] bg-white flex flex-col justify-center items-center px-6 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 shadow-lg shadow-indigo-100">
          <MonitorPlay className="text-indigo-600" size={32} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 mb-2">
          {expired ? 'Session expired' : 'Welcome to Reportr'}
        </h1>
        <p className="text-sm text-zinc-500 mb-8 leading-relaxed">
          {expired
            ? 'Your session expired. Open the dashboard to reconnect — recordings will upload automatically after that.'
            : 'Please sign in to your Reportr dashboard to connect your workspace.'}
        </p>

        <button
          onClick={openWebLogin}
          className="w-full bg-blue-500 hover:bg-blue-600 active:scale-[0.98] transition-all py-3 px-4 rounded-xl text-white font-semibold text-sm shadow-md"
        >
          {expired ? 'Open Dashboard' : 'Sign In to Reportr'}
        </button>
      </div>
    );
  }

  // --- Authenticated State ---
  return (
    <div className="w-[360px] min-h-[520px] bg-white flex flex-col text-zinc-800 font-sans shadow-2xl overflow-hidden">
      
      {/* Top Navigation Tabs */}
      <div className="flex w-full bg-zinc-50/50 border-b border-zinc-100 p-1">
        <button 
          onClick={() => setActiveTab('capture')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-t-lg transition-colors text-sm font-semibold ${activeTab === 'capture' ? 'text-zinc-900 bg-white shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
        >
          <Camera size={18} /> Capture
        </button>
        <button 
          onClick={() => setActiveTab('record')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-t-lg transition-colors text-sm font-semibold ${activeTab === 'record' ? 'text-zinc-900 bg-white shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
        >
          <MonitorPlay size={18} /> Record
        </button>
      </div>

      {/* Main Content Area */}
      <div className="p-4 flex-1 flex flex-col gap-4">
        
        {/* Workspace Dropdown */}
        {session.workspaces && session.workspaces.length > 0 && (
          <div className="w-full relative">
            <select
              title="workspace selection"
              className="w-full appearance-none rounded-xl border border-zinc-200 bg-zinc-50/50 py-2.5 pl-3 pr-10 text-sm font-semibold text-zinc-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
              value={activeWorkspace}
              onChange={(e) => setActiveWorkspace(e.target.value)}
            >
              {session.workspaces.map((w: any) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-zinc-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        )}

        {activeTab === 'record' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setRecordMode('desktop')}
                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${recordMode === 'desktop' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-zinc-100 bg-white text-zinc-500 hover:border-zinc-200'}`}
              >
                <Monitor size={28} />
                <span className="text-xs font-semibold">Desktop</span>
              </button>
              <button
                onClick={() => setRecordMode('this-tab')}
                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${recordMode === 'this-tab' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-zinc-100 bg-white text-zinc-500 hover:border-zinc-200'}`}
              >
                <AppWindow size={28} />
                <span className="text-xs font-semibold">This Tab</span>
              </button>
            </div>

            <div className="bg-zinc-50 rounded-xl border border-zinc-100 p-3.5 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-700">Tab Sound</span>
                <button
                  onClick={() => setTabSound(!tabSound)}
                  className={`w-10 h-6 rounded-full flex items-center px-1 transition-colors duration-200 focus:outline-none ${tabSound ? 'bg-blue-500 justify-end' : 'bg-zinc-200 justify-start'}`}
                >
                  <div className="w-4 h-4 bg-white rounded-full shadow-sm"></div>
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-700">Control bar & Annotations</span>
                <button
                  onClick={() => setControlBar(!controlBar)}
                  className={`w-10 h-6 rounded-full flex items-center px-1 transition-colors duration-200 focus:outline-none ${controlBar ? 'bg-blue-500 justify-end' : 'bg-zinc-200 justify-start'}`}
                >
                  <div className="w-4 h-4 bg-white rounded-full shadow-sm"></div>
                </button>
              </div>
            </div>

            <div className="bg-blue-50 text-blue-600 rounded-xl p-3 text-xs flex items-start gap-2">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
              <p>The Mic is off & Tab Sound is on to prevent echoes during recording.</p>
            </div>
          </div>
        )}

        {activeTab === 'capture' && (
          <div className="flex flex-col gap-3 flex-1 justify-center">
            <button 
              onClick={() => handleCapture('visible')}
              className="flex items-center gap-3 p-4 border border-zinc-200 rounded-xl text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-all shadow-sm cursor-pointer"
            >
               <ImageIcon size={20} className="text-zinc-500" />
               <span className="font-medium text-sm">Visible Part</span>
            </button>
            <button 
              onClick={() => handleCapture('full')}
              className="flex items-center gap-3 p-4 border border-zinc-200 rounded-xl text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-all shadow-sm cursor-pointer"
            >
               <MonitorPlay size={20} className="text-zinc-500" />
               <span className="font-medium text-sm">Full Page</span>
            </button>
            <button 
              onClick={() => handleCapture('selected')}
              className="flex items-center gap-3 p-4 border border-zinc-200 rounded-xl text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-all shadow-sm cursor-pointer"
            >
               <Focus size={20} className="text-zinc-500" />
               <span className="font-medium text-sm">Selected Area</span>
            </button>
          </div>
        )}
      </div>

      {/* Bottom Footer Actions */}
      <div className="p-4 border-t border-zinc-100 bg-zinc-50/50 mt-auto">
        {activeTab === 'record' ? (
          !isRecording ? (
            <button
              onClick={handleStart}
              className="w-full bg-blue-500 hover:bg-blue-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-white font-bold text-sm shadow-md"
            >
              <div className="w-3 h-3 bg-white rounded-full mr-1" />
              Start Recording
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="w-full bg-red-500 hover:bg-red-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-white font-bold text-sm shadow-md animate-pulse"
            >
              <StopCircle size={18} />
              Stop Recording
            </button>
          )
        ) : (
          <p className="text-center text-xs text-zinc-400 py-2">Select an option above to capture screenshot</p>
        )}
      </div>

      {/* User bar */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-t border-zinc-100 bg-white">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-xs font-bold uppercase text-white">
          {(session.user?.name || session.user?.email || 'U').charAt(0)}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold text-zinc-800">{session.user?.name || 'Signed in'}</p>
          <p className="truncate text-[11px] text-zinc-400">{session.user?.email}</p>
        </div>
        <button
          onClick={openDashboard}
          title="My recordings"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-blue-600 transition-colors cursor-pointer"
        >
          <LayoutGrid size={16} />
        </button>
        <button
          onClick={handleSignOut}
          title="Sign out"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-red-50 hover:text-red-500 transition-colors cursor-pointer"
        >
          <LogOut size={16} />
        </button>
      </div>

    </div>
  );
}
