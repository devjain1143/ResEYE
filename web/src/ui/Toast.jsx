// Toast system per spec section 9.10
// Single typewriter line at bottom-left, prefixed "> ", auto-dismiss 5s, no box
import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';

const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    let prefix = '> ';
    if (type === 'error') prefix = 'FAULT: ';
    if (type === 'success') prefix = 'RECEIVED: ';

    setToasts(prev => [...prev, { id, message, prefix, type }]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="fixed bottom-6 left-6 z-[200] flex flex-col gap-2 max-w-lg" aria-live="polite">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className="font-typewriter text-sm text-bone-80 relative px-3 py-1"
            style={{
              background: 'repeating-linear-gradient(0deg, rgb(255 255 255 / .03) 0 1px, transparent 1px 3px)',
              animation: 'toast-in .3s ease-out'
            }}
          >
            <span className="font-terminal tracking-wider">{toast.prefix}</span>
            {toast.message}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
