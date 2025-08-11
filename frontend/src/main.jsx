import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

function uid() { return (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)) }
const saved = JSON.parse(localStorage.getItem('rt_user') || 'null') || (() => {
  const u = { user_id: uid(), username: 'User-' + uid().slice(0,5) }
  localStorage.setItem('rt_user', JSON.stringify(u))
  return u
})()

export default function App(){
  const [users,setUsers]=useState([])
  const [peer,setPeer]=useState(null)
  const [msgs,setMsgs]=useState([])
  const [text,setText]=useState('')
  const [status,setStatus]=useState('connecting') // connecting | connected | reconnecting | disconnected
  const wsRef = useRef(null)

  useEffect(()=>{
    let ws
    let retry = 0
    let heart

    const connect = () => {
      setStatus(retry ? 'reconnecting' : 'connecting')
      const url = `ws://localhost:8001/ws?user_id=${saved.user_id}&username=${saved.username}`
      ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setStatus('connected')
        retry = 0
        heart && clearInterval(heart)
        heart = setInterval(() => {
          try { ws.send(JSON.stringify({ type: 'ping' })) } catch {}
        }, 20000)
      }

      ws.onmessage = (e) => {
        try{
          const m = JSON.parse(e.data)
          if (m.type === 'presence') setUsers(m.users.filter(u => u.user_id !== saved.user_id))
          if (m.type === 'message')  setMsgs(p => [...p, m])
        }catch{}
      }

      ws.onclose = () => {
        setStatus('reconnecting')
        heart && clearInterval(heart)
        const delay = Math.min(5000, 500 * Math.pow(2, retry++))
        setTimeout(connect, delay)
      }

      ws.onerror = () => {
        try { ws.close() } catch {}
      }
    }

    connect()
    return () => {
      setStatus('disconnected')
      heart && clearInterval(heart)
      try { ws && ws.close() } catch {}
    }
  }, [])

  const send = () => {
    if (!peer || !text.trim()) return
    const m = { type:'message', to: peer.user_id, text: text.trim(), from: saved.user_id }
    wsRef.current?.send(JSON.stringify(m))
    setMsgs(p => [...p, m])
    setText('')
  }

  const thread = msgs.filter(m =>
    peer && ((m.from === peer.user_id && m.to === saved.user_id) || (m.from === saved.user_id && m.to === peer.user_id))
  )

  const statusColor = {
    connected:    '#22c55e',
    connecting:   '#eab308',
    reconnecting: '#eab308',
    disconnected: '#ef4444'
  }[status] || '#9ca3af'

  return (
    <div style={{display:'grid',gridTemplateColumns:'260px 1fr',height:'100vh',fontFamily:'system-ui, -apple-system, Segoe UI, Roboto, Arial'}}>
      {/* Sidebar */}
      <aside style={{borderRight:'1px solid #e5e7eb',padding:12,display:'flex',flexDirection:'column',gap:12}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <h3 style={{margin:0}}>Online</h3>
          <span title={status} style={{
            display:'inline-flex', alignItems:'center', gap:6, fontSize:12, padding:'4px 8px',
            border:'1px solid #e5e7eb', borderRadius:999
          }}>
            <span style={{width:8,height:8,borderRadius:'50%',background:statusColor,display:'inline-block'}}/>
            {status === 'connected' ? 'Connected' :
             status === 'reconnecting' ? 'Reconnecting…' :
             status === 'connecting' ? 'Connecting…' : 'Disconnected'}
          </span>
        </div>

        {users.length === 0 ? (
          <div style={{fontSize:13, opacity:0.7, lineHeight:1.5}}>
            No one online yet.<br/>Open a second window (or Incognito) at <code>http://localhost:5174</code>.
          </div>
        ) : (
          <ul style={{listStyle:'none', padding:0, margin:0}}>
            {users.map(u => {
              const selected = peer?.user_id === u.user_id
              return (
                <li key={u.user_id}>
                  <button
                    onClick={()=>setPeer(u)}
                    style={{
                      width:'100%', padding:12, marginBottom:8,
                      display:'flex', alignItems:'center', gap:10,
                      border:'1px solid ' + (selected ? '#2563eb' : '#e5e7eb'),
                      background: selected ? '#eaf2ff' : '#ffffff',
                      borderRadius:10,
                      boxShadow: selected ? '0 0 0 2px rgba(37,99,235,0.18)' : 'none',
                      fontWeight: selected ? 700 : 400,
                      transition:'all .15s ease', cursor:'pointer'
                    }}>
                    <span style={{
                      width:10, height:10, borderRadius:'50%', background:'#22c55e',
                      display:'inline-block', boxShadow:'0 0 0 2px #eafff3'
                    }}/>
                    {u.username}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </aside>

      {/* Main */}
      <main style={{display:'flex',flexDirection:'column',background:'#fff'}}>
        <header style={{padding:12, borderBottom:'1px solid #e5e7eb', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <b>{peer ? `Chat with ${peer.username}` : 'Select a user to chat'}</b>
          <div style={{opacity:.8, fontSize:14}}>
            You: <strong>{saved.username}</strong> • Online users: <strong>{users.length}</strong>
          </div>
        </header>

        <section style={{flex:1, padding:12, overflow:'auto'}}>
          {peer ? (
            thread.length ? thread.map((m, i) => (
              <div key={i} style={{marginBottom:8, textAlign: m.from === saved.user_id ? 'right' : 'left'}}>
                <span style={{display:'inline-block', padding:'8px 12px', border:'1px solid #e5e7eb', borderRadius:10}}>
                  {m.text}
                </span>
              </div>
            )) : <p style={{opacity:.6, fontSize:14}}>Say hi 👋</p>
          ) : (
            <p style={{opacity:.6, fontSize:14}}>No chat selected.</p>
          )}
        </section>

        <form onSubmit={(e)=>{e.preventDefault(); send()}} style={{display:'flex',gap:8,padding:12,borderTop:'1px solid #e5e7eb'}}>
          <input
            value={text}
            onChange={e=>setText(e.target.value)}
            placeholder={peer ? 'Type a message' : 'Select a user to start chatting'}
            disabled={!peer}
            style={{flex:1,padding:12,border:'1px solid #d1d5db',borderRadius:10}}
          />
          <button disabled={!peer || !text.trim()} type="submit" style={{padding:'12px 16px', borderRadius:10, cursor: (!peer || !text.trim()) ? 'not-allowed' : 'pointer'}}>
            Send
          </button>
        </form>
      </main>
    </div>
  )
}

const root = createRoot(document.getElementById('root'))
root.render(<App />)
