"use client";

import { use } from "react";
import PostEditor from "../../PostEditor";

export default function EditBlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <PostEditor mode="edit" slug={slug} />;
}
