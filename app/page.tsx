import { Suspense } from "react";
import HomeClient from "./HomeClient";

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black text-white p-10">
          Loading...
        </div>
      }
    >
      <HomeClient />
    </Suspense>
  );
}