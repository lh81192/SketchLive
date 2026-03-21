import Link from 'next/link';
import { Button } from '@/components/ui/button';

const features = [
  {
    icon: '✨',
    title: 'AI 智能生成',
    description: '采用先进的 AI 算法，自动将静态漫画转换为动态漫剧，保留原作风格的同时添加动态效果。',
    color: 'from-primary to-secondary',
  },
  {
    icon: '🎨',
    title: '多种风格',
    description: '支持多种漫剧风格选择，满足不同类型漫画的转换需求，无论是少年漫、少女漫还是其他风格。',
    color: 'from-accent to-orange-400',
  },
  {
    icon: '🚀',
    title: '一键分享',
    description: '生成完成后可一键分享到作品广场，让更多人欣赏您的创意作品。',
    color: 'from-primary to-secondary',
  },
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      {/* Hero Section - Video-First Style */}
      <section className="relative flex-1 flex flex-col items-center justify-center py-24 px-4 overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-secondary-50" />
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary-200 rounded-full blur-3xl opacity-30 animate-float" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent-200 rounded-full blur-3xl opacity-30 animate-float" style={{ animationDelay: '1.5s' }} />

        <div className="relative text-center max-w-4xl space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-100 text-primary-700 text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
            AI 驱动 · 创意无限
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-heading font-bold leading-tight">
            <span className="text-gradient">AI 漫剧生成平台</span>
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
            将静态漫画转化为<span className="text-primary font-semibold">动态漫剧</span>，释放您的创意潜能
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6">
            <Link href="/register">
              <Button size="lg" className="btn-accent text-lg px-8 py-4">
                立即开始
                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Button>
            </Link>
            <Link href="/gallery">
              <Button variant="outline" size="lg" className="text-lg px-8 py-4 border-primary text-primary hover:bg-primary hover:text-white">
                浏览作品
              </Button>
            </Link>
          </div>
        </div>

        {/* Floating cards decoration */}
        <div className="absolute top-1/4 left-8 hidden lg:block animate-float" style={{ animationDelay: '0.5s' }}>
          <div className="w-32 h-44 rounded-lg bg-gradient-to-br from-primary to-secondary shadow-soft-lg rotate-[-8deg]" />
        </div>
        <div className="absolute bottom-1/4 right-8 hidden lg:block animate-float" style={{ animationDelay: '1s' }}>
          <div className="w-28 h-40 rounded-lg bg-gradient-to-br from-accent to-orange-400 shadow-soft-lg rotate-[6deg]" />
        </div>
      </section>

      {/* Features Section - Block-based cards */}
      <section className="py-24 px-4 bg-white">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="section-title mb-4">功能特点</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              强大的 AI 技术支持，让您的漫画动起来
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="card-soft p-8 group cursor-pointer"
              >
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center text-3xl mb-6 group-hover:scale-110 transition-transform duration-300`}>
                  {feature.icon}
                </div>
                <h3 className="text-xl font-heading font-bold text-foreground mb-3">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="card-soft p-12 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-primary to-secondary opacity-5" />
            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-heading font-bold mb-4">
                准备好创作您的第一部漫剧了吗？
              </h2>
              <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
                只需上传 EPUB 漫画，AI 就会自动为您生成配乐、音效和动态效果
              </p>
              <Link href="/register">
                <Button size="lg" className="btn-primary text-lg px-10 py-4">
                  开始创作
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
