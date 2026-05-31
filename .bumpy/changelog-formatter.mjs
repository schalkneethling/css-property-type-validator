const BUMP_HEADINGS = {
  major: "Breaking Changes",
  minor: "Features",
  patch: "Bug Fixes",
};

const BUMP_ORDER = ["major", "minor", "patch"];

function bumpTypeForPackage(bumpFile, packageName) {
  const release = bumpFile.releases.find(({ name }) => name === packageName);
  return release?.type === "none" || !release?.type ? "patch" : release.type;
}

function sortBumpFiles(bumpFiles, packageName) {
  return [...bumpFiles].sort((a, b) => {
    return (
      BUMP_ORDER.indexOf(bumpTypeForPackage(b, packageName)) -
      BUMP_ORDER.indexOf(bumpTypeForPackage(a, packageName))
    );
  });
}

function formatSummary(summary) {
  return summary
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function dependencySourceList(release) {
  if (!release.bumpSources.length) {
    return "(internal)";
  }

  return release.bumpSources.map(({ name, newVersion }) => `\`${name}\` v${newVersion}`).join(", ");
}

export default function changelogFormatter() {
  return ({ release, bumpFiles, date }) => {
    const lines = [`## ${release.newVersion} (${date})`, ""];
    const grouped = new Map(BUMP_ORDER.map((type) => [type, []]));
    const releaseBumpFiles = sortBumpFiles(
      bumpFiles.filter(({ id }) => release.bumpFiles.includes(id)),
      release.name,
    );

    for (const bumpFile of releaseBumpFiles) {
      const type = bumpTypeForPackage(bumpFile, release.name);
      const summaryLines = formatSummary(bumpFile.summary ?? "");

      if (!summaryLines.length) {
        continue;
      }

      grouped.get(type)?.push(summaryLines);
    }

    if (release.isDependencyBump) {
      grouped.get("patch")?.push([`Updated dependency ${dependencySourceList(release)}.`]);
    }

    if (release.isGroupBump && !release.isDependencyBump) {
      grouped
        .get(release.type)
        ?.push([`Version bump from group with ${dependencySourceList(release)}.`]);
    }

    if (release.isCascadeBump && !release.isDependencyBump && !release.isGroupBump) {
      grouped.get(release.type)?.push([`Version bump from ${dependencySourceList(release)}.`]);
    }

    for (const type of BUMP_ORDER) {
      const entries = grouped.get(type);

      if (!entries?.length) {
        continue;
      }

      lines.push(`### ${BUMP_HEADINGS[type]}`, "");

      for (const entry of entries) {
        const [firstLine, ...rest] = entry;
        lines.push(`- ${firstLine}`);

        for (const line of rest) {
          lines.push(`  ${line}`);
        }
      }

      lines.push("");
    }

    return lines.join("\n");
  };
}
