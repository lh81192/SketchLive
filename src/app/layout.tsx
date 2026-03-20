import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AI 漫剧生成平台',
  description: '将漫画转化为动态漫的 AI 平台',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
