export interface ZhihuCookieStore {
  cookies: { name: string; value: string; domain: string }[];
  d_c0: string;
  savedAt: number;
}

export interface ZhihuArticle {
  title: string;
  markdown: string;
  coverUrl: string | null;
  author: string | null;
}

export interface ZhihuApiResponse {
  id: number;
  title: string;
  content: string;
  url: string;
  author?: { name: string; url: string };
  image_url?: string;
  excerpt?: string;
  created?: number;
  updated?: number;
}
