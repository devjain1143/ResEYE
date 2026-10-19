import React, { useEffect, useRef } from 'react';

export default function GlitchEye({ className = '', style, stare = false, size }) {
  const eyeRef = useRef(null);

  useEffect(() => {
    if (stare) {
      if (eyeRef.current) {
        eyeRef.current.style.setProperty('--pupil-x', '0px');
        eyeRef.current.style.setProperty('--pupil-y', '0px');
      }
      return;
    }

    const handleMouseMove = (e) => {
      if (!eyeRef.current) return;
      const rect = eyeRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const dx = e.clientX - cx;
      const dy = e.clientY - cy;

      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);

      const intensity = Math.min(1, dist / 350);
      const maxOffsetX = 50;
      const maxOffsetY = 22;

      const px = Math.cos(angle) * intensity * maxOffsetX;
      const py = Math.sin(angle) * intensity * maxOffsetY;

      eyeRef.current.style.setProperty('--pupil-x', `${px.toFixed(2)}px`);
      eyeRef.current.style.setProperty('--pupil-y', `${py.toFixed(2)}px`);
    };

    const handleMouseLeave = () => {
      if (!eyeRef.current) return;
      eyeRef.current.style.setProperty('--pupil-x', '0px');
      eyeRef.current.style.setProperty('--pupil-y', '0px');
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [stare]);

  if (size === 'inline') {
    return (
      <span ref={eyeRef} className={`glitch-eye-inline-wrap ${className}`} style={style}>
        <div className="tv tv-inline">
          <div className="lid">
            <div className="eye">
              <i className="px"></i>
              <b className="slice s1"><i className="px"></i></b>
              <b className="slice s2"><i className="px"></i></b>
              <b className="slice s3"><i className="px"></i></b>
              <b className="slice s4"><i className="px"></i></b>
              <b className="slice s5"><i className="px"></i></b>
              <u className="cuts"></u>
            </div>
          </div>
        </div>
      </span>
    );
  }

  return (
    <div ref={eyeRef} className={`tv ${className}`} style={style}>
      <div className="lid">
        <div className="eye">
          <i className="px"></i>
          <b className="slice s1"><i className="px"></i></b>
          <b className="slice s2"><i className="px"></i></b>
          <b className="slice s3"><i className="px"></i></b>
          <b className="slice s4"><i className="px"></i></b>
          <b className="slice s5"><i className="px"></i></b>
          <u className="cuts"></u>
        </div>
      </div>
    </div>
  );
}
