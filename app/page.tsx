import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/options";
import HomeCarousel from "@/components/home/home-carousel";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  return <HomeCarousel signedIn={Boolean(session)} />;
}
