'use client'

import { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'

export function MarketStatus() {
  const [status, setStatus] = useState<{
    label: string;
    color: string;
    time: string;
    timezone: string;
  }>({
    label: 'Loading...',
    color: 'bg-zinc-400',
    time: '',
    timezone: ''
  })

  useEffect(() => {
    const updateStatus = () => {
      const now = new Date()
      
      // NYSE is ET (UTC-5 or UTC-4)
      const etFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false,
      })
      
      const etParts = etFormatter.formatToParts(now)
      const getPart = (type: string) => parseInt(etParts.find(p => p.type === type)?.value || '0')
      
      const hour = getPart('hour')
      const minute = getPart('minute')
      const day = now.getDay() // 0 = Sunday, 6 = Saturday
      
      const isWeekend = day === 0 || day === 6
      const timeInMinutes = hour * 60 + minute
      
      let label = 'Market Closed'
      let color = 'bg-zinc-400'
      
      if (!isWeekend) {
        if (timeInMinutes >= 240 && timeInMinutes < 570) {
          label = 'Pre-Market'
          color = 'bg-amber-500'
        } else if (timeInMinutes >= 570 && timeInMinutes < 960) {
          label = 'Market Open'
          color = 'bg-emerald-500'
        } else if (timeInMinutes >= 960 && timeInMinutes < 1200) {
          label = 'After Hours'
          color = 'bg-blue-500'
        }
      }

      // User's local time formatting
      const localTime = now.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: true 
      })
      
      // Get human readable timezone e.g. "Eastern Time" or "EDT"
      const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop()?.replace('_', ' ') || ''

      setStatus({
        label,
        color,
        time: localTime,
        timezone: localTimezone
      })
    }

    updateStatus()
    const interval = setInterval(updateStatus, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-white border border-zinc-200 shadow-sm backdrop-blur-sm animate-fade-in group">
      <div className="flex items-center gap-2 pr-3 border-r border-zinc-200">
        <span className="relative flex h-2 w-2">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${status.color} opacity-75`}></span>
          <span className={`relative inline-flex rounded-full h-2 w-2 ${status.color}`}></span>
        </span>
        <span className="text-[10px] font-black text-olea-obsidian tracking-widest uppercase whitespace-nowrap">{status.label}</span>
      </div>
      <div className="flex items-center gap-2 pl-1">
        <Clock className="h-3 w-3 text-zinc-400 group-hover:text-olea-evergreen transition-colors" />
        <span className="text-[10px] font-mono font-black text-olea-obsidian tabular-nums uppercase">
          {status.time} <span className="text-zinc-400 ml-1 font-bold">{status.timezone}</span>
        </span>
      </div>
    </div>
  )
}
