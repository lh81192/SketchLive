import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { getUserIdFromRequest, requireUserId } from "@/lib/get-user-id";

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  const unauthorized = requireUserId(userId);
  if (unauthorized) return unauthorized;

  const allProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.createdAt));
  return NextResponse.json(allProjects);
}

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  const unauthorized = requireUserId(userId);
  if (unauthorized) return unauthorized;

  const body = (await request.json()) as {
    title: string;
    script?: string;
    inputSource?: "script" | "epub";
  };
  const id = ulid();

  const [project] = await db
    .insert(projects)
    .values({
      id,
      userId,
      title: body.title,
      script: body.script || "",
      inputSource: body.inputSource === "epub" ? "epub" : "script",
    })
    .returning();

  return NextResponse.json(project, { status: 201 });
}
