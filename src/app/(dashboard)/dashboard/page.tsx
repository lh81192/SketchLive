import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/db';
import { getDashboardProjects } from '@/lib/dashboard-projects';
import { ProjectListManager } from '@/components/dashboard/project-list-manager';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/login');
  }

  const projects = getDashboardProjects(db, session.user.id);
  const completedCount = projects.filter((project) => project.status === 'completed').length;
  const processingCount = projects.filter((project) => project.status === 'processing').length;

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
              <p className="text-3xl font-heading font-bold text-foreground">{projects.length}</p>
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
                {completedCount}
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
                {processingCount}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
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
        <ProjectListManager projects={projects} />
      )}
    </div>
  );
}
