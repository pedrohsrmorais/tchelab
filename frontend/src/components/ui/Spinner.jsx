export function Spinner({ size = 20, color = '#3b82f6' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2" strokeLinecap="round"
        strokeDasharray="31.4 31.4" strokeDashoffset="10" />
    </svg>
  )
}

export function PageLoader({ text = 'Carregando...' }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', gap:'1.5rem', background:'#0f172a' }}>
      <div style={{ position:'relative', width:80, height:80 }}>
        <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'2px solid rgba(59,130,246,0.2)', animation:'spin 2s linear infinite' }} />
        <div style={{ position:'absolute', inset:4, borderRadius:'50%', border:'2px solid transparent', borderTopColor:'#3b82f6', animation:'spin 0.8s linear infinite' }} />
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <TcheLabIcon size={32} />
        </div>
      </div>
      <p style={{ color:'rgba(255,255,255,0.5)', fontSize:'0.875rem', letterSpacing:'0.05em' }}>{text}</p>
    </div>
  )
}

function TcheLabIcon({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="18" fill="url(#gl)" opacity="0.15" />
      <path d="M10 14h20M20 14v14M14 20h12" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="20" cy="14" r="2.5" fill="#3b82f6"/>
      <circle cx="14" cy="20" r="2" fill="#60a5fa" opacity="0.7"/>
      <circle cx="26" cy="20" r="2" fill="#60a5fa" opacity="0.7"/>
      <circle cx="20" cy="28" r="2.5" fill="#3b82f6"/>
      <defs><linearGradient id="gl" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse"><stop stopColor="#3b82f6"/><stop offset="1" stopColor="#1d4ed8"/></linearGradient></defs>
    </svg>
  )
}
export default Spinner;
