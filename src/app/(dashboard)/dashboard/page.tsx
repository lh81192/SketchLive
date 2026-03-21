import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';

// Mock project data - will be replaced with database queries
const mockProjects = [
  {
    id: '1',
    title: '我的第一个漫剧',
    description: '测试项目',
    status: 'completed',
    createdAt: new Date('2024-01-15'),
  },
  {
    id: '2',
    title: '漫画章节1',
    description: '正在生成中',
    status: 'processing',
    createdAt: new Date('2024-01-20'),
  },
];

const statusConfig = {
  pending: { label: '等待中', color: 'bg-gray-100 text-gray-600', icon: '⏳' },
  processing: { label: '生成中', color: 'bg-blue-100 text-blue-600', icon: '⚡' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-600', icon: '✨' },
  failed: { label: '失败', color: 'bg-red-100 text-red-600', icon: '❌' },
};

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground">
            我的作品
          </h1>
          <p className="text-muted-foreground mt-1">
            管理您的漫剧项目，发现创意无限可能
          </p>
        </div>
        <Link href="/dashboard/new">
          <Button className="btn-accent">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            创建新作品
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-soft p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <span className="text-2xl">📚</span>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">总作品数</p>
              <p className="text-3xl font-heading font-bold text-foreground">{mockProjects.length}</p>
            </div>
          </div>
        </div>
        <div className="card-soft p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
              <span className="text-2xl">✅</span>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">已完成</p>
              <p className="text-3xl font-heading font-bold text-foreground">
                {mockProjects.filter(p => p.status === 'completed').length}
              </p>
            </div>
          </div>
        </div>
        <div className="card-soft p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-orange-400 flex items-center justify-center">
              <span className="text-2xl">🎬</span>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">生成中</p>
              <p className="text-3xl font-heading font-bold text-foreground">
                {mockProjects.filter(p => p.status === 'processing').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Projects Grid */}
      {mockProjects.length === 0 ? (
        <div className="card-soft p-12 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary-100 to-secondary-100 flex items-center justify-center">
            <span className="text-4xl">🎨</span>
          </div>
          <h3 className="text-xl font-heading font-bold text-foreground mb-2">
            还没有任何作品
          </h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            上传您的第一个 EPUB 漫画，让 AI 为您创作独一无二的动态漫剧
          </p>
          <Link href="/dashboard/new">
            <Button className="btn-accent">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              创建您的第一个漫剧
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mockProjects.map((project) => {
            const status = statusConfig[project.status as keyof typeof statusConfig] || statusConfig.pending;
            return (
              <Link key={project.id} href={`/dashboard/projects/${project.id}`}>
                <Card className="card-soft hover:shadow-card-hover cursor-pointer group overflow-hidden">
                  {/* Cover placeholder */}
                  <div className="h-40 bg-gradient-to-br from-primary-50 to-secondary-50 relative overflow-hidden">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-6xl opacity-30 group-hover:scale-110 transition-transform duration-300">
                        📖
                      </span>
                    </div>
                    <div className={`absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-medium ${status.color}`}>
                      <span className="mr-1">{status.icon}</span>
                      {status.label}
                    </div>
                  </div>
                  <CardContent className="p-5">
                    <h3 className="text-lg font-heading font-bold text-foreground mb-2 group-hover:text-primary transition-colors">
                      {project.title}
                    </h3>
                    <p className="text-muted-foreground text-sm line-clamp-2">
                      {project.description}
                    </p>
                    <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {project.createdAt.toLocaleDateString('zh-CN')}
                      </span>
                      <span className="flex items-center gap-1 text-primary font-medium group-hover:underline">
                        查看详情
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
