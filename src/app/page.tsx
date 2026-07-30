import { Separator } from "radix-ui";
import { HomeCopy } from "./home-copy";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-papa font-sans text-papa-ink">
      <main className="flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-8 py-24 text-center">
        <HomeCopy />
        <Separator.Root className="h-px w-full max-w-md bg-moana/20" />
        <p
          lang="mi"
          data-testid="macron-sample"
          className="font-heading text-lg font-semibold"
        >
          āēīōū ĀĒĪŌŪ — Para Whānui, Rauemi Hangarua, Kete Karāhe, Āpopo
        </p>
        <ul className="flex gap-4" aria-label="Wellington colour tokens">
          <li className="rounded bg-kakariki px-4 py-2 text-papa">Kākāriki</li>
          <li className="rounded bg-moana px-4 py-2 text-papa">Moana</li>
          <li className="rounded bg-kowhai px-4 py-2 text-papa">Kōwhai</li>
        </ul>
      </main>
    </div>
  );
}
