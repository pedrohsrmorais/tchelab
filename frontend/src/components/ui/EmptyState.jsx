export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'1rem', padding:'4rem 2rem', textAlign:'center' }}>
      {Icon && (
        <div style={{ width:64, height:64, borderRadius:'50%', background:'rgba(59,130,246,0.1)', display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid rgba(59,130,246,0.2)' }}>
          <Icon size={28} color="#60a5fa" />
        </div>
      )}
      <div>
        <h3 style={{ fontWeight:600, color:'#fff', marginBottom:'0.5rem' }}>{title}</h3>
        {description && <p style={{ color:'rgba(255,255,255,0.4)', fontSize:'0.875rem' }}>{description}</p>}
      </div>
      {action && action}
    </div>
  )
}

export default EmptyState;
