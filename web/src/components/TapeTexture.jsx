import React from 'react';
import { ScratchFilter } from '../marks/Mark';

// Full texture stack per spec section 5
// Layers: scanlines, vignette, noise, tracking bands
// Rendered as fixed, pointer-events:none, aria-hidden
export default function TapeTexture() {
  return (
    <>
      <ScratchFilter />
      <div aria-hidden="true" className="pointer-events-none select-none">
        <div className="fx-scan" />
        <div className="fx-vig" />
        <div className="fx-noise" />
        <div className="fx-bands">
          <div className="fx-band" />
          <div className="fx-band" />
          <div className="fx-band" />
        </div>
      </div>
    </>
  );
}
