import './globals.css'
import type { Metadata } from 'next'
import { Fredoka, Nunito } from 'next/font/google'
import { AuthProvider } from '@/components/auth-provider'

const fredoka = Fredoka({
  subsets: ['latin'],
  variable: '--font-fredoka',
  weight: ['300', '400', '500', '600', '700'],
})

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-nunito',
  weight: ['300', '400', '500', '600', '700'],
})

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
      <body className={`${fredoka.variable} ${nunito.variable}`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
