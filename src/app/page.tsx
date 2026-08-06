import { Separator } from "radix-ui";
import { HomeCopy } from "./home-copy";
import { AddressSchedule } from "./address-schedule";
import { SortingSearch } from "@/components/sorting-search";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-papa font-sans text-papa-ink">
      <main className="flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-8 py-24 text-center">
        <HomeCopy />
        <AddressSchedule />
        <Separator.Root className="h-px w-full max-w-md bg-moana/20" />
        <SortingSearch />
      </main>
    </div>
  );
}
