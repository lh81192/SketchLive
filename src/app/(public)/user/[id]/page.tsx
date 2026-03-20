import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { formatDate, formatDuration } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User, Calendar, Video, Heart, Star, Play } from "lucide-react";

interface PageProps {
  params: Promise<{ id: string }>;
}

// Status mapping
const statusMap: Record<string, { label: string; className: string }> = {
  pending: { label: "待处理", className: "bg-gray-100 text-gray-800" },
  processing: { label: "生成中", className: "bg-blue-100 text-blue-800" },
  completed: { label: "已完成", className: "bg-green-100 text-green-800" },
  failed: { label: "失败", className: "bg-red-100 text-red-800" },
};

export default async function UserProfilePage({ params }: PageProps) {
  const { id } = await params;

  // Get user public info
  const user = db.prepare(`
    SELECT
      id,
      nickname,
      avatar,
      role,
      created_at
    FROM users
    WHERE id = ?
  `).get(id) as {
    id: string;
    nickname: string | null;
    avatar: string | null;
    role: string;
    created_at: string;
  } | undefined;

  if (!user) {
    notFound();
  }

  // Get user stats
  const projectCountResult = db.prepare(`
    SELECT COUNT(*) as count FROM projects WHERE user_id = ? AND status = 'completed'
  `).get(id) as { count: number };

  const likesCountResult = db.prepare(`
    SELECT COUNT(*) as count FROM likes WHERE user_id = ?
  `).get(id) as { count: number };

  const favoritesCountResult = db.prepare(`
    SELECT COUNT(*) as count FROM favorites WHERE user_id = ?
  `).get(id) as { count: number };

  // Get user's public projects
  const projects = db.prepare(`
    SELECT
      p.id,
      p.user_id,
      p.title,
      p.description,
      p.cover_image,
      p.status,
      p.video_url,
      p.duration,
      p.created_at,
      (SELECT COUNT(*) FROM likes WHERE project_id = p.id) as like_count,
      (SELECT COUNT(*) FROM comments WHERE project_id = p.id) as comment_count
    FROM projects p
    WHERE p.user_id = ? AND p.status = 'completed'
    ORDER BY p.created_at DESC
  `).all(id) as {
    id: string;
    user_id: string;
    title: string;
    description: string | null;
    cover_image: string | null;
    status: string;
    video_url: string | null;
    duration: number | null;
    created_at: string;
    like_count: number;
    comment_count: number;
  }[];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <Link href="/gallery" className="inline-flex items-center text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回作品广场
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* User Profile Card */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center gap-6">
              {/* Avatar */}
              <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                {user.avatar ? (
                  <Image
                    src={user.avatar}
                    alt={user.nickname || "用户"}
                    width={96}
                    height={96}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="h-12 w-12 text-gray-400" />
                )}
              </div>

              {/* User Info */}
              <div className="flex-1 text-center md:text-left">
                <h1 className="text-2xl font-bold text-gray-900">
                  {user.nickname || "未设置昵称"}
                </h1>
                <div className="flex items-center justify-center md:justify-start gap-4 mt-2 text-sm text-gray-500">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>加入于 {formatDate(user.created_at)}</span>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="flex gap-8">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-gray-600">
                    <Video className="h-4 w-4" />
                    <span className="font-semibold">{projectCountResult.count}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">作品</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-gray-600">
                    <Heart className="h-4 w-4" />
                    <span className="font-semibold">{likesCountResult.count}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">获赞</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-gray-600">
                    <Star className="h-4 w-4" />
                    <span className="font-semibold">{favoritesCountResult.count}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">收藏</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Projects Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">作品列表</CardTitle>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <div className="text-center py-12">
                <Video className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">暂无公开作品</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project) => (
                  <Link key={project.id} href={`/project/${project.id}`}>
                    <div className="group bg-white border rounded-lg overflow-hidden hover:shadow-lg transition-shadow cursor-pointer">
                      {/* Cover */}
                      <div className="relative aspect-video bg-gray-100">
                        {project.cover_image ? (
                          <Image
                            src={project.cover_image}
                            alt={project.title}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <Video className="h-12 w-12 text-gray-300" />
                          </div>
                        )}
                        {/* Play overlay */}
                        {project.video_url && (
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                              <Play className="h-6 w-6 text-gray-800 ml-1" />
                            </div>
                          </div>
                        )}
                        {/* Duration badge */}
                        {project.duration && (
                          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                            {formatDuration(project.duration)}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="p-4">
                        <h3 className="font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                          {project.title}
                        </h3>
                        {project.description && (
                          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                            {project.description}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
                          <span>{formatDate(project.created_at)}</span>
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1">
                              <Heart className="h-3 w-3" />
                              {project.like_count}
                            </span>
                            <span className="flex items-center gap-1">
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                              {project.comment_count}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
