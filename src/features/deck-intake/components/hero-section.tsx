import { Sparkles } from "lucide-react"

export function HeroSection() {
  return (
    <section className="overflow-hidden rounded-[32px] border border-black/10 bg-stone-950 text-stone-100 shadow-2xl shadow-amber-950/20">
      <div className="flex justify-center px-6 py-10 sm:px-8 sm:py-12 lg:py-14">
        <div className="inline-flex items-center gap-3 rounded-full border border-amber-200/15 bg-white/5 px-6 py-3 text-lg font-semibold uppercase tracking-[0.3em] text-amber-100/90 shadow-[0_0_40px_rgba(245,158,11,0.12)] sm:px-8 sm:py-4 sm:text-2xl">
          <Sparkles className="size-5 sm:size-6" />
          <span className="text-center">MTG AUTO GOLDFISH</span>
        </div>
      </div>
    </section>
  )
}
