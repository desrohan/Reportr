import { useState, useEffect } from 'react';
import { Camera, StopCircle, RefreshCw, Disc2 } from 'lucide-react';
import './App.css';
import './index.css';

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isValidating, setIsValidating] = useState(true);

  useEffect(() => {
    // Check initial recording state
    chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
      if (response) {
        setIsRecording(response.isRecording);
      }
      setIsValidating(false);
    });
  }, []);

  const handleStart = () => {
    chrome.runtime.sendMessage({ action: 'startRecording' }, (response) => {
      if (response && response.status === 'started') {
        setIsRecording(true);
      }
    });
  };

  const handleStop = () => {
    chrome.runtime.sendMessage({ action: 'stopRecording' });
    setIsRecording(false);
  };

  if (isValidating) {
    return (
      <div className="w-[340px] h-[460px] bg-zinc-950 flex flex-col justify-center items-center text-zinc-100 p-6">
        <RefreshCw className="animate-spin text-zinc-500 mb-4" size={24} />
      </div>
    );
  }

  return (
    <div className="w-[340px] h-[460px] bg-zinc-950 flex flex-col items-center justify-between p-6">
      <div className="w-full text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/20">
          <Disc2 className="text-white" size={32} />
        </div>
        <h1 className="text-2xl font-bold text-zinc-100 mb-1">Reportr</h1>
        <p className="text-sm text-zinc-400">Record a bug in one click.</p>
      </div>

      <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 my-6 shadow-inner">
         <div className="flex justify-between items-center mb-3">
           <span className="text-sm font-medium text-zinc-300">Microphone</span>
           <div className="w-10 h-6 bg-indigo-500 rounded-full flex justify-end items-center px-1 cursor-pointer">
             <div className="w-4 h-4 bg-white rounded-full"></div>
           </div>
         </div>
         <div className="flex justify-between items-center mb-3">
           <span className="text-sm font-medium text-zinc-300">Camera</span>
           <div className="w-10 h-6 bg-zinc-700/50 rounded-full flex justify-start items-center px-1 cursor-pointer">
             <div className="w-4 h-4 bg-zinc-500 rounded-full"></div>
           </div>
         </div>
         <div className="flex justify-between items-center pt-3 border-t border-zinc-800">
           <span className="text-xs text-zinc-500">Workspace</span>
           <span className="text-xs font-semibold text-zinc-300">Personal</span>
         </div>
      </div>

      {!isRecording ? (
        <button
          onClick={handleStart}
          className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] transition-all flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-white font-semibold text-sm shadow-xl shadow-indigo-600/30"
        >
          <Camera size={18} />
          <span>Start Recording</span>
        </button>
      ) : (
        <button
          onClick={handleStop}
          className="w-full bg-rose-500 hover:bg-rose-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-white font-semibold text-sm shadow-xl shadow-rose-500/30 animate-pulse"
        >
          <StopCircle size={18} />
          <span>Stop Recording</span>
        </button>
      )}
    </div>
  );
}
