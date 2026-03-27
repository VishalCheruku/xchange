import React from 'react'
import logo from '../../assets/xchange-symbol.svg'

const LoaderX = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white text-slate-800">
      <div className="relative w-32 h-32">
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-slate-900 via-sky-500 to-slate-900 animate-pulse opacity-25 blur-xl" />
        {/* Static base logo for immediate visibility */}
        <div
          className="absolute inset-0 bg-center bg-contain bg-no-repeat opacity-45"
          style={{ backgroundImage: `url(${logo})` }}
        />
        {/* Slowly rotating outline */}
        <img src={logo} alt="Xchange" className="w-full h-full opacity-55 animate-spin-slow" />
        {/* Gradient fill sweep inside the X mask */}
        <div
          className="absolute inset-0 fill-x"
          style={{
            WebkitMaskImage: `url(${logo})`,
            maskImage: `url(${logo})`,
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
            maskPosition: 'center',
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
          }}
        />
      </div>
      <p className="mt-6 text-sm tracking-[0.3em] uppercase text-slate-500">Loading Xchange</p>
    </div>
  )
}

export default LoaderX
