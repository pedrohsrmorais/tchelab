export function SkeletonCard({ lines = 2 }) {
  return (
    <div className="card" style={{ gap:'0.75rem', display:'flex', flexDirection:'column' }}>
      <div className="anim-shimmer" style={{ height:16, borderRadius:8, width:'60%' }} />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="anim-shimmer" style={{ height:12, borderRadius:8, width: i === lines-1 ? '40%' : '80%', animationDelay:`${i*0.1}s` }} />
      ))}
    </div>
  )
}

export default SkeletonCard;
