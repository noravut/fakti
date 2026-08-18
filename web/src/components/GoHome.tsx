import { useEffect } from 'react'
import { Redirect, useLocation } from 'wouter'
import { useStore } from '../store'

/** URL ที่ไม่มีอยู่จริง → กลับหน้าหลักพร้อมบอกเหตุ ห้ามปล่อยจอว่าง */
export function GoHome({ message }: { message?: string }) {
  const setFlash = useStore(s => s.setFlash)

  useEffect(() => {
    if (message) setFlash(message)
  }, [message, setFlash])

  return <Redirect to="/" />
}

/** ใช้ในหน้า session/summary เมื่อ id ที่ขอมาไม่มีอยู่แล้ว */
export function useGoHomeWithMessage(): (message: string) => void {
  const [, navigate] = useLocation()
  const setFlash = useStore(s => s.setFlash)

  return (message: string) => {
    setFlash(message)
    navigate('/')
  }
}
