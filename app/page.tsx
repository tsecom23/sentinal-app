import { Suspense } from "react";

import HomeClient from "./HomeClient";

export default function Home() {

  return (

    <Suspense

      fallback={

        <div className="min-h-screen bg-[#f6f7f9] text-gray-900 p-10">

          Loading...

        </div>

      }

    >

      <HomeClient />

    </Suspense>

  );

}