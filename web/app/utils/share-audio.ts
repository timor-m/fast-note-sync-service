import { readerIconHtml } from './reader-icons'

function clock(seconds: number) {
  const value = Math.max(0, Math.floor(seconds || 0))
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

// Enhance native audio after hydration; SSR and browsers without JS keep controls.
export function enhanceShareAudio(root: HTMLElement) {
  const events = new AbortController()
  const players: HTMLAudioElement[] = []
  for (const audio of root.querySelectorAll<HTMLAudioElement>('audio')) {
    if (audio.closest('.voice-message')) continue
    players.push(audio)
    const wrapper = document.createElement('div')
    wrapper.className = 'voice-message'
    wrapper.setAttribute('role', 'group')
    wrapper.setAttribute('aria-label', '语音消息')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'voice-bubble'
    button.innerHTML = `<span class="voice-wave" aria-hidden="true">${readerIconHtml('voice')}</span><span class="voice-caption">点击播放</span><span class="voice-duration">--″</span>`
    const caption = button.querySelector<HTMLElement>('.voice-caption')!
    const durationLabel = button.querySelector<HTMLElement>('.voice-duration')!
    const timeline = document.createElement('div')
    timeline.className = 'voice-timeline'
    const seek = document.createElement('input')
    seek.type = 'range'; seek.min = '0'; seek.max = '1000'; seek.step = '1'; seek.value = '0'
    seek.setAttribute('aria-label', '语音播放进度')
    const time = document.createElement('span')
    time.className = 'voice-time'
    timeline.append(seek, time)
    audio.before(wrapper)
    wrapper.append(button, timeline, audio)
    audio.controls = false
    let failed = false
    function sync() {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0
      const playing = !audio.paused && !audio.ended
      const available = Boolean(audio.currentSrc || audio.src || audio.querySelector('source[src]'))
      wrapper.classList.toggle('is-playing', playing && audio.readyState >= 3)
      button.disabled = !available
      button.setAttribute('aria-pressed', String(playing))
      button.setAttribute('aria-label', playing ? '暂停语音' : failed ? '重试播放语音' : '播放语音')
      caption.textContent = !available ? '音频暂不可用' : failed ? '播放失败，点击重试' : playing ? audio.readyState < 3 ? '加载中…' : '正在播放' : audio.currentTime > 0 && !audio.ended ? '继续播放' : '点击播放'
      durationLabel.textContent = duration >= 60 ? clock(Math.ceil(duration)) : duration ? `${Math.ceil(duration)}″` : '--″'
      time.textContent = `${clock(audio.currentTime)} / ${clock(duration)}`
      seek.disabled = !duration || failed
      seek.value = String(duration ? Math.round(audio.currentTime / duration * 1000) : 0)
      seek.setAttribute('aria-valuetext', time.textContent)
    }
    button.addEventListener('click', async () => {
      if (!audio.paused && !audio.ended) { audio.pause(); return }
      for (const other of root.querySelectorAll('audio')) if (other !== audio) other.pause()
      try {
        if (failed) audio.load()
        failed = false
        if (audio.ended) audio.currentTime = 0
        await audio.play()
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) failed = true
      }
      sync()
    }, { signal: events.signal })
    seek.addEventListener('input', () => {
      if (Number.isFinite(audio.duration)) audio.currentTime = Number(seek.value) / 1000 * audio.duration
      sync()
    }, { signal: events.signal })
    for (const name of ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'ended', 'emptied', 'waiting', 'playing', 'canplay']) audio.addEventListener(name, sync, { signal: events.signal })
    audio.addEventListener('error', () => { failed = true; sync() }, { signal: events.signal })
    sync()
  }
  return () => { events.abort(); for (const audio of players) audio.pause() }
}
