/** From and To must be different Salesforce orgs on every wizard step. */
export function orgsAreSame(sourceKey, targetKey) {
  return Boolean(sourceKey && targetKey && sourceKey === targetKey);
}

export function distinctTarget(sourceKey, targetKey) {
  if (!targetKey) return "";
  return orgsAreSame(sourceKey, targetKey) ? "" : targetKey;
}

export function pickOtherOrg(orgKeys, currentKey) {
  const rest = (orgKeys || []).filter((key) => key && key !== currentKey);
  return rest.length === 1 ? rest[0] : "";
}

/**
 * Changing orgs mid-wizard must not keep the previous org’s members or retrieve.
 * A planned promotion hop reuses the same snapshot and skips the reset.
 */
export function sessionAfterOrgChange({
  changed,
  previousSource = "",
  nextSource = "",
  previousTarget = "",
  nextTarget = "",
  hadRetrieve = false,
  promotingHop = false
} = {}) {
  if (promotingHop) {
    return { resetPackage: false, invalidateRetrieve: false, bounceTo: "" };
  }
  const pathReady = Boolean(nextSource && nextTarget && nextSource !== nextTarget);
  if (changed === "source" && previousSource !== nextSource) {
    return {
      resetPackage: true,
      invalidateRetrieve: true,
      bounceTo: pathReady ? "package" : "start"
    };
  }
  if (changed === "target" && previousTarget !== nextTarget) {
    return {
      resetPackage: false,
      invalidateRetrieve: Boolean(hadRetrieve),
      bounceTo: !pathReady ? "start" : hadRetrieve ? "review" : ""
    };
  }
  return { resetPackage: false, invalidateRetrieve: false, bounceTo: "" };
}
