export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/dashboard/:path*", "/submissions/:path*", "/operations/:path*", "/reports/:path*", "/admin/:path*", "/ai-helper/:path*", "/resources/:path*"]
};
