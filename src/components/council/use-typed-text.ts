"use client"

import { useEffect, useRef, useState } from "react"

/** How often the reveal advances. ~33fps: smooth without being a busy loop. */
const TICK_MS = 30

/**
 * Ticks it should take to drain whatever is buffered. Low enough that the
 * text keeps moving, high enough that a large chunk does not simply appear.
 */
const TICKS_TO_DRAIN = 22

/**
 * Reveal text at a readable pace instead of in the jumps it arrives in.
 *
 * The server streams a turn and writes the text so far every ~400ms; the
 * browser picks that up on its poll. So the text genuinely arrives while the
 * model is writing it — but it arrives in blocks of a hundred characters at a
 * time, and a block appearing is not the same thing as watching something be
 * typed.
 *
 * This is a display buffer, the same idea as the few seconds a video player
 * holds back. It only ever DELAYS text that has already arrived; it cannot
 * show a character the model has not produced. Two rules keep that true:
 *
 * - The reveal never runs past what has been received.
 * - The moment the turn is no longer in flight it snaps to the full text, so
 *   a finished message is never left looking half-written.
 *
 * The rate adapts to how much is waiting rather than being a fixed
 * characters-per-second: a fixed rate either crawls behind a fast model or
 * empties instantly and then stalls until the next poll, and that stall is
 * what makes it look like blocks again.
 */
export function useTypedText(text: string, active: boolean): string {
  const [shown, setShown] = useState(() => (active ? 0 : text.length))
  // Restarting the reveal for a different message: without this, moving to
  // the next speaker would carry the previous message's progress across.
  const previous = useRef(text)

  useEffect(() => {
    // Text that is not an extension of what came before is a different
    // message, not a shrinking one.
    if (!text.startsWith(previous.current)) setShown(0)
    previous.current = text
  }, [text])

  useEffect(() => {
    // No timer once the turn is done — the return below already hands back
    // the whole message, so there is nothing left to advance towards.
    if (!active) return
    if (shown >= text.length) return

    const timer = setInterval(() => {
      setShown((current) => {
        if (current >= text.length) return current
        const remaining = text.length - current
        const step = Math.max(1, Math.ceil(remaining / TICKS_TO_DRAIN))
        return Math.min(text.length, current + step)
      })
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [text, active, shown])

  // The slice is what actually guarantees nothing unreceived is shown: it
  // cannot reach past the text it was given, whatever `shown` holds. The
  // clamp in the loop keeps `shown` a sensible index; it is not the guard.
  return active ? text.slice(0, shown) : text
}
