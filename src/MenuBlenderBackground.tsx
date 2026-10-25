import { useEffect, useRef, useState } from 'react'

/** Locally rendered Blender animation. No WebGL context or external requests. */
export default function MenuBlenderBackground({ motion }: { motion: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const [requested, setRequested] = useState(motion)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => { if (motion) setRequested(true) }, [motion])
  useEffect(() => {
    const element = video.current
    if (!element || !requested || failed) return
    let cancelled = false
    if (motion) void element.play().catch(() => { if (!cancelled) setPlaying(false) })
    else { element.pause(); setPlaying(false) }
    return () => { cancelled = true; element.pause() }
  }, [motion, requested, failed])
  return <div className="menu-blender-background" data-motion={motion}>
    <img src={`${import.meta.env.BASE_URL}menu/workshop-poster.webp`} alt="" />
    {!failed && <video ref={video} muted loop playsInline autoPlay={motion} preload="none"
      src={requested ? `${import.meta.env.BASE_URL}menu/workshop-loop.mp4` : undefined}
      onPlaying={() => setPlaying(true)} onError={() => { setPlaying(false); setFailed(true) }}
      style={{opacity: playing && motion ? 1 : 0}} aria-hidden="true" />}
  </div>
}
