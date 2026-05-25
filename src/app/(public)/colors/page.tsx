import Link from "next/link";
import { Win } from "@/components/win";
import { listAllColors, inkFor } from "@/lib/colors";

type Filter = "all" | "free" | "taken";
type Sort = "index" | "name";

const PALETTE_STRIP = ` ::: 00 01 02 03 04 05 06 07 | 08 09 10 11 12 13 14 15 :::`;

export const metadata = {
  title: "Katalog odstínů | Kup si Odstín",
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: Filter; sort?: Sort }>;
}) {
  const { filter = "all", sort = "index" } = await searchParams;
  const all = await listAllColors();

  const filtered = all.filter((c) =>
    filter === "free" ? !c.owner : filter === "taken" ? !!c.owner : true,
  );
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "cs");
    return a.cgaIndex - b.cgaIndex;
  });

  const freeCount = all.filter((c) => !c.owner).length;
  const takenCount = all.length - freeCount;

  const FilterBtn = ({ value, label }: { value: Filter; label: string }) => (
    <Link
      href={{ pathname: "/colors", query: { filter: value, sort } }}
      className={"btn" + (filter === value ? " btn-primary" : "")}
    >
      {label}
    </Link>
  );
  const SortBtn = ({ value, label }: { value: Sort; label: string }) => (
    <Link
      href={{ pathname: "/colors", query: { filter, sort: value } }}
      className={"btn" + (sort === value ? " btn-primary" : "")}
    >
      {label}
    </Link>
  );

  return (
    <Win title="C:\KUPSI\KATALOG.EXE">
      <div className="stack-loose">
        <div
          className="row"
          style={{ justifyContent: "space-between", alignItems: "flex-end" }}
        >
          <div>
            <h1 className="h1" style={{ marginBottom: 6 }}>
              Paleta 16 barev.
            </h1>
            <p className="muted" style={{ fontSize: 15, margin: 0 }}>
              Žádné variace, žádné mezistupně.{" "}
              <b style={{ color: "var(--c4)" }}>Jenom těch 16</b>.
            </p>
          </div>
          <div className="col" style={{ alignItems: "flex-end" }}>
            <div className="row">
              <span className="muted" style={{ fontSize: 14 }}>
                Zobrazit:
              </span>
              <FilterBtn value="all" label="Vše" />
              <FilterBtn value="free" label="Jen volné" />
              <FilterBtn value="taken" label="Jen obsazené" />
            </div>
            <div className="row">
              <span className="muted" style={{ fontSize: 14 }}>
                Seřadit:
              </span>
              <SortBtn value="index" label="# CGA pořadí" />
              <SortBtn value="name" label="A→Z" />
            </div>
          </div>
        </div>

        <pre
          className="ascii"
          style={{ fontSize: 13, color: "var(--c8)", margin: 0 }}
        >
          {PALETTE_STRIP}
        </pre>

        <div className="swatches">
          {sorted.map((c) => {
            const ink = inkFor(c.hex);
            return (
              <Link
                key={c.id}
                href={`/colors/${c.hex.replace("#", "")}`}
                style={{ textDecoration: "none", background: "none" }}
              >
                <div className="sw">
                  <div
                    className="sw-color"
                    style={{ background: c.hex, color: ink }}
                  >
                    <span className="corner">
                      {String(c.cgaIndex).padStart(2, "0")}
                    </span>
                    <span className={"badge " + (c.owner ? "taken" : "free")}>
                      {c.owner ? "OBSAZENO" : "VOLNÝ"}
                    </span>
                  </div>
                  <div className="sw-meta">
                    <span
                      className="name"
                      style={{ textTransform: "capitalize" }}
                    >
                      {c.name}
                    </span>
                    <span className="num">{c.hex}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {sorted.length === 0 && (
          <div
            className="inset center"
            style={{ padding: 40, color: "var(--c8)" }}
          >
            Žádné barvy v této kategorii.
            <br />
            Zkus jiný filtr.
          </div>
        )}

        <hr className="dash" />

        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="muted">
            Celkem: <b>{all.length}</b> · Volných:{" "}
            <b style={{ color: "var(--c4)" }}>{freeCount}</b> · Obsazených:{" "}
            <b>{takenCount}</b>
          </span>
          <Link className="btn" href="/">
            ← Zpět na hlavní
          </Link>
        </div>
      </div>
    </Win>
  );
}
