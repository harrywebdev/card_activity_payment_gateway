import Link from "next/link";
import { listColors, isLightHex } from "@/lib/colors";
import { BRAND_NAME } from "@/lib/config";

export const metadata = {
  title: `Katalog odstínů | ${BRAND_NAME}`,
};

type Filter = "all" | "available" | "owned";

export default async function ColorsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; filter?: Filter }>;
}) {
  const { page: pageStr, filter = "all" } = await searchParams;
  const page = Number.parseInt(pageStr ?? "1", 10);

  const { items, pageSize, total } = await listColors({
    page,
    availableOnly: filter === "available",
    ownedOnly: filter === "owned",
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Katalog odstínů</h1>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString("cs-CZ")}{" "}
            {filter === "available"
              ? "volných odstínů"
              : filter === "owned"
                ? "obsazených odstínů"
                : "odstínů celkem"}
            .
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <FilterLink current={filter} target="all">
            Všechny
          </FilterLink>
          <FilterLink current={filter} target="available">
            Volné
          </FilterLink>
          <FilterLink current={filter} target="owned">
            Obsazené
          </FilterLink>
        </div>
      </header>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {items.map((c) => {
          const textClass = isLightHex(c.hex) ? "text-black" : "text-white";
          return (
            <li key={c.id}>
              <Link
                href={`/colors/${c.hex.replace("#", "")}`}
                className="block aspect-square rounded-lg overflow-hidden border border-border hover:opacity-95 transition"
              >
                <div
                  className={`h-full w-full p-3 flex flex-col justify-between ${textClass}`}
                  style={{ backgroundColor: c.hex }}
                >
                  <span className="text-xs font-mono opacity-80">{c.hex}</span>
                  <div>
                    <div className="text-sm font-medium leading-tight capitalize line-clamp-2">
                      {c.name}
                    </div>
                    <div className="text-xs opacity-80 mt-1 font-mono">
                      {c.owner ? c.owner.username : "—"}
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-3 pt-4 text-sm">
          {page > 1 && (
            <Link
              href={`/colors?page=${page - 1}&filter=${filter}`}
              className="rounded-md border border-border px-3 py-1.5 hover:bg-muted"
            >
              ← Předchozí
            </Link>
          )}
          <span className="text-muted-foreground">
            Strana {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/colors?page=${page + 1}&filter=${filter}`}
              className="rounded-md border border-border px-3 py-1.5 hover:bg-muted"
            >
              Další →
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}

function FilterLink({
  current,
  target,
  children,
}: {
  current: Filter;
  target: Filter;
  children: React.ReactNode;
}) {
  const active = current === target;
  return (
    <Link
      href={`/colors?filter=${target}`}
      className={`rounded-md px-3 py-1.5 transition ${
        active
          ? "bg-primary text-primary-foreground"
          : "border border-border hover:bg-muted text-muted-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
