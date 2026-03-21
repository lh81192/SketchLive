import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';

export default function GalleryPage() {
  // Mock gallery data - will be replaced with database queries
  const publicProjects = [
    {
      id: '1',
      title: '示例作品 1',
      author: '用户 A',
      description: '这是一个示例作品',
      likes: 42,
      views: 156,
    },
    {
      id: '2',
      title: '示例作品 2',
      author: '用户 B',
      description: '另一个示例作品',
      likes: 28,
      views: 89,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center py-8">
        <h1 className="text-4xl font-heading font-bold text-foreground mb-4">
          作品<span className="text-gradient">广场</span>
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          发现来自社区的精彩漫剧作品，感受 AI 创作的魅力
        </p>
      </div>

      {publicProjects.length === 0 ? (
        <div className="card-soft p-12 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary-100 to-secondary-100 flex items-center justify-center">
            <span className="text-4xl">📚</span>
          </div>
          <h3 className="text-xl font-heading font-bold text-foreground mb-2">
            还没有公开作品
          </h3>
          <p className="text-muted-foreground">
            成为第一个创作并分享作品的人吧！
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {publicProjects.map((project) => (
            <Link key={project.id} href={`/project/${project.id}`}>
              <Card className="card-soft hover:shadow-card-hover cursor-pointer group overflow-hidden">
                {/* Cover */}
                <div className="h-44 bg-gradient-to-br from-primary-50 via-secondary-50 to-accent-50 relative overflow-hidden">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-7xl opacity-30 group-hover:scale-110 transition-transform duration-300">
                      🎬
                    </span>
                  </div>
                  {/* Views badge */}
                  <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-black/30 text-white text-xs backdrop-blur-sm">
                    👁 {project.views}
                  </div>
                </div>

                <CardContent className="p-5">
                  <h3 className="text-lg font-heading font-bold text-foreground mb-2 group-hover:text-primary transition-colors line-clamp-1">
                    {project.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                    {project.description}
                  </p>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-xs">
                        {project.author[0]}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {project.author}
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <span>❤️</span>
                      {project.likes}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
