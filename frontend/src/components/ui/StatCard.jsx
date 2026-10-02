export function StatCard({ icon: Icon, label, value, sub, color = '#3b82f6', delay = 0 }) {
  return (
    <div className="card anim-fade-up" style={{ animationDelay: `${delay}ms`, display:'flex', gap:'1rem', alignItems:'flex-start' }}>
      <div style={{ width:44, height:44, borderRadius:12, background:`${color}22`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, border:`1px solid ${color}44` }}>
        <Icon size={20} color={color} />
      </div>
      <div>
        <p style={{ fontSize:'0.75rem', color:'rgba(255,255,255,0.45)', marginBottom:'0.25rem', fontWeight:500 }}>{label}</p>
        <p style={{ fontSize:'1.5rem', fontWeight:800, color:'#fff', lineHeight:1 }}>{value ?? '—'}</p>
        {sub && <p style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.35)', marginTop:'0.25rem' }}>{sub}</p>}
      </div>
    </div>
  )
}

export default StatCard;
