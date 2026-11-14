// شعار ZAPP: الأيقونة (Z مع الصندوق) + الاسم
export function LogoMark({ className = 'h-10 w-10' }) {
  return <img src="/logo-mark-96.png" srcSet="/logo-mark-96.png 1x, /logo-mark-256.png 2.5x" alt="" className={`${className} rounded-xl`} />
}

export default function Logo() {
  return (
    <div className="flex items-center gap-2.5" dir="ltr">
      <LogoMark />
      <div className="leading-none">
        <div className="font-brand text-2xl font-black italic tracking-tight text-brand">ZAPP</div>
        <div className="mt-0.5 font-brand text-[10px] font-bold italic tracking-[0.2em] text-white/80">DELIVERY</div>
      </div>
    </div>
  )
}
