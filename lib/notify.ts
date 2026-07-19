'use client'

import { useSyncExternalStore } from 'react'

export type NoteKind = 'ok' | 'warn' | 'error' | 'msg'

export type Note = {
  id: number
  kind: NoteKind
  text: string
  /** Where it came from — a driver's name later, an action now. */
  from?: string
  at: number
  read: boolean
}

// ponytail: module-level store + useSyncExternalStore (React's own API). A state
// library for one list of notes is a dependency to hold an array.
let notes: Note[] = []
let seq = 0
const subs = new Set<() => void>()

function emit() {
  subs.forEach((f) => f())
}

export function notify(kind: NoteKind, text: string, from?: string): void {
  // Newest first, capped — this is a feed, not an archive.
  notes = [{ id: ++seq, kind, text, from, at: Date.now(), read: false }, ...notes].slice(0, 50)
  emit()
}

export function markAllRead(): void {
  if (!notes.some((n) => !n.read)) return
  notes = notes.map((n) => (n.read ? n : { ...n, read: true }))
  emit()
}

export function clearNotes(): void {
  notes = []
  emit()
}

function subscribe(f: () => void): () => void {
  subs.add(f)
  return () => subs.delete(f)
}

const EMPTY: Note[] = []
const getSnapshot = () => notes
// Server render has no notes; a stable empty array keeps hydration quiet.
const getServerSnapshot = () => EMPTY

export function useNotes(): Note[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
