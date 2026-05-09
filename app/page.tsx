import { Suspense } from "react";

import HomeClient from "./HomeClient";

export default function Home() {

  return (

    <Suspense

      fallback={

        <div className="min-h-screen bg-[#07070b] text-white p-10">

          Loading...

        </div>

      }

    >

      <HomeClient />

    </Suspense>

  );

}