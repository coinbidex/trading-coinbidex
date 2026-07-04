import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

// Singleton socket — created once, shared across all components
let socket: Socket | null = null
let socketUrl = ''

function getSocketUrl(): string {
  // In production VITE_WS_URL is set to wss://yourdomain.com
  // In dev it connects to the same origin so Vite proxy handles it
  return import.meta.env.VITE_WS_URL || window.location.origin
}

export function getSocket(): Socket {
  const url = getSocketUrl()

  // Reconnect if URL changed (e.g. switching envs)
  if (socket && socketUrl !== url) {
    socket.disconnect()
    socket = null
  }

  if (!socket) {
    socketUrl = url
    const { state } = JSON.parse(localStorage.getItem('coinbidex-auth') || '{"state":{}}')
    socket = io(url, {
      auth:               { token: state?.accessToken || '' },
      transports:         ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay:  2000,
      timeout:            10000,
    })

    socket.on('connect',         () => console.log('[WS] connected'))
    socket.on('disconnect',      (r) => console.log('[WS] disconnected:', r))
    socket.on('connect_error',   (e) => console.warn('[WS] error:', e.message))
  }

  return socket
}

// Update auth token on the socket after login
export function updateSocketAuth(token: string): void {
  if (socket) {
    socket.auth = { token }
    socket.disconnect().connect()
  }
}

// Subscribe to a single market ticker
export function useMarketSocket(symbol: string, onTicker: (data: any) => void): void {
  // Stable ref so the callback never causes re-subscription
  const callbackRef = useRef(onTicker)
  callbackRef.current = onTicker

  useEffect(() => {
    if (!symbol) return

    const s = getSocket()
    const handler = (data: any) => {
      if (data?.symbol === symbol) callbackRef.current(data)
    }

    s.emit('subscribe:market', symbol)
    s.on('ticker:update', handler)

    return () => {
      s.emit('unsubscribe:market', symbol)
      s.off('ticker:update', handler)
    }
  }, [symbol]) // only re-subscribe when symbol changes
}

// Subscribe to all tickers (for ticker bar)
export function useAllTickersSocket(onTicker: (data: any) => void): void {
  const callbackRef = useRef(onTicker)
  callbackRef.current = onTicker

  useEffect(() => {
    const s = getSocket()
    const handler = (data: any) => callbackRef.current(data)
    s.on('ticker:all', handler)
    return () => { s.off('ticker:all', handler) }
  }, []) // empty deps - subscribe once, callback ref handles updates
}
