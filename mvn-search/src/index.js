const fetch = require("node-fetch");
const ProxyAgent = require("proxy-agent");

const proxyAgent = new ProxyAgent();

let birtArtifactId
let searchTerm;
let requiredVersion;
let truncatedVersion;
let extendedVersion;
class KnownCoordinatesGAV {
    constructor(g, a, v) {
        this.g = g;
        this.a = a;
        this.v = v;
    }
    matches(hit) {
        return hit.g == this.g && hit.a == this.a && hit.v == this.v;
    }
    searchUrl() {
        return "https://search.maven.org/solrsearch/select?q=g:" +
            this.g + "+AND+a:" + this.a + "+AND+v:" + this.v + "&core=gav";
    }
}
class KnownCoordinatesGA {
    constructor(g, a) {
        this.g = g;
        this.a = a;
    }
    matches(hit) {
        return hit.g == this.g && hit.a == this.a;
    }
    searchUrl() {
        return "https://search.maven.org/solrsearch/select?q=g:" +
            this.g + "+AND+a:" + this.a + "&core=gav";
    }
}
class KnownCoordinatesA {
    constructor(a) {
        this.a = a;
    }
    matches(hit) {
        return hit.a == this.a;
    }
    searchUrl() {
        return "https://search.maven.org/solrsearch/select?q=a:" + 
            this.a + "&core=gav";
    }
}
let knownCoordinatesMap = {
    "bcpg": new KnownCoordinatesA("bcpg-jdk18on"),
    "org.apache.xmlgraphics": new KnownCoordinatesGAV(
        "org.apache.xmlgraphics",
        "xmlgraphics-commons",
        "2.9"),
    "com.github.virtuald.curvesapi": new KnownCoordinatesGAV(
        "com.github.virtuald",
        "curvesapi",
        "1.08"),
    "com.ibm.icu": new KnownCoordinatesA("icu4j"),
    "com.sun.jna.platform": new KnownCoordinatesA("jna-platform"),
    "javax.xml.rpc-api": new KnownCoordinatesGA("jakarta.xml.rpc", "jakarta.xml.rpc-api"),
    "org.apache.commons.commons-collections4": new KnownCoordinatesGA("org.apache.commons", "commons-collections4"),
    "org.apache.commons.commons-compress": new KnownCoordinatesGA("org.apache.commons", "commons-compress"),
    "org.apache.commons.commons.math3": new KnownCoordinatesGA("org.apache.commons", "commons-math3"),
    "org.apache.logging.log4j.api": new KnownCoordinatesGA("org.apache.logging.log4j", "log4j-api"),
    "org.apache.poi": new KnownCoordinatesGA("org.apache.poi", "poi"),
    "org.apache.poi.ooxml": new KnownCoordinatesGA("org.apache.poi", "poi-ooxml"),
    // nothing found for org.apache.poi.ooxml.schemas
    "org.apache.xerces": new KnownCoordinatesGA("xerces", "xercesImpl"),
    "org.eclipse.emf.ecore": new KnownCoordinatesGA("org.eclipse.emf", "org.eclipse.emf.ecore"),
    "org.eclipse.jetty.servlet-api": new KnownCoordinatesGA("org.eclipse.jetty.toolchain", "jetty-servlet-api")
};
let getKnownCoordinates = function(searchTerm) {
    let knownCoordinates = knownCoordinatesMap[searchTerm];
    if(knownCoordinates != null) {
        return knownCoordinates;
    }
    let prefix = "org.apache.batik.";
    if(searchTerm.startsWith(prefix)) {
        let suffix = searchTerm.substring(prefix.length);
        if(suffix == "dom.svg") {
            suffix = "svg-dom";
        }
        suffix = suffix.replace(".", "-");
        return new KnownCoordinatesGA("org.apache.xmlgraphics", "batik-" + suffix);
    }
    prefix = "org.apache.commons.commons-";
    if(searchTerm.startsWith(prefix)) {
        let suffix = searchTerm.substring(prefix.length);
        suffix = suffix.replace(".", "-");
        return new KnownCoordinatesGA("commons-" + suffix, "commons-" + suffix);
    }
    prefix = "org.apache.commons.";
    if(searchTerm.startsWith(prefix)) {
        let suffix = searchTerm.substring(prefix.length);
        suffix = suffix.replace(".", "-");
        return new KnownCoordinatesGA("commons-" + suffix, "commons-" + suffix);
    }
    prefix = "org.apache.lucene.";
    if(searchTerm.startsWith(prefix)) {
        let suffix = searchTerm.substring(prefix.length);
        suffix = suffix.replace(".", "-");
        return new KnownCoordinatesGA("org.apache.lucene", "lucene-" + suffix);
    }
    return null;
}
let knownCoordinates = null;

function formatDependency(hit) {
    return `echo "GROUP_ID='${hit.g}';ARTIFACT_ID='${hit.a}';VERSION='${hit.v}'"`;
}

function displayHits(hits, overrideVersion) {
    console.log("# displayHits", hits.length, overrideVersion);

    if (hits.length === 0) {
        return true;
    }

    if(displayHitsForKnownCoordinates(hits)) {
        return true;
    }

    if(overrideVersion) {
        let filteredHits = hits.filter(hit => hit.v == overrideVersion);
        console.log("#   hits that match version", filteredHits.length);
        for(let hit of filteredHits) {
            console.log("#   ", hit.g, hit.a, hit.v);
        }
        if(filteredHits.length >= 1) {
            let hit = filteredHits[0];
            console.log(formatDependency(hit));
            return true;
        }
    }
    else {
        if(displayHitsForVersion(hits, requiredVersion)) {
            return true;
        }
    
        if(truncatedVersion != null) {
            if(displayHitsForVersion(hits, truncatedVersion)) {
                return true;
            }
        }
    
        if(extendedVersion != null) {
            if(displayHitsForVersion(hits, extendedVersion)) {
                return true;
            }
        }
    }

    return false;
}

function displayHitsForKnownCoordinates(hits) {
    console.log("# displayHitsForKnownCoordinates", hits.length);
    if(knownCoordinates != null && knownCoordinates.g != null && knownCoordinates.a != null && 
            knownCoordinates.v != null) {
        for(let hit of hits) {
            if(knownCoordinates.matches(hit)) {
                console.log(formatDependency(hit));
                return true;
            }
        }
        }
    return false;
}

function displayHitsForVersion(hits, version) {
    console.log("# displayHitsForVersion", hits.length, version);

    if(knownCoordinates == null) {
        knownCoordinates = { matches: function(hit) {
            if(hit.a == searchTerm) {
                return true;
            }
            let lastIndexOfDot = searchTerm.lastIndexOf(".");
            while(lastIndexOfDot >= 0) {
                let g = searchTerm.substring(0, lastIndexOfDot);
                let a = searchTerm.substring(lastIndexOfDot + 1);
                if(hit.g == g && hit.a == a) {
                    return true;
                }
                if(hit.g == searchTerm && hit.a == a) {
                    return true;
                }
                lastIndexOfDot = searchTerm.lastIndexOf(".", lastIndexOfDot-1);
            }
            return false;
        }};
    }

    let filteredHits = hits.filter(hit => hit.v == version);
    console.log("#   hits that match version", filteredHits.length);
    for(let hit of filteredHits) {
        console.log("#   ", hit.g, hit.a, hit.v);
    }
    if(filteredHits.length == 1) {
        let hit = filteredHits[0];
        if(knownCoordinates.matches(hit)) {
            console.log(formatDependency(hit));
            return true;
        }
        return false;
    }
    if(filteredHits.length > 1) {
        for(let hit of filteredHits) {
            if(knownCoordinates.matches(hit)) {
                console.log(formatDependency(hit));
                return true;
            }
        }
        for(let hit of filteredHits) {
            console.log(formatDependency(hit));
        }
        return true;
    }
    return false;
}

function mvnSearchResponseArrived(resp) {
    let hits; 
    try {
        hits = JSON.parse(resp).response.docs;
    }
    catch(e) {
        console.error("JSON parse error", url, resp);
        hits = [];
    }
    console.log("# mvnSearchResponseArrived", hits.length);
    for(let hit of hits) {
        console.log("# hit", hit.g, hit.a, hit.v || hit.latestVersion);
    }

    if (hits.length === 0) {
        return;
    }

    let found = displayHits(hits.map(hit => {
        if(hit.v) {
            return hit;
        }
        return {
            g: hit.g,
            a: hit.a,
            v: hit.latestVersion
        };
    }));

    if(found) {
        return;
    }

    let versionsToCheck = [requiredVersion];
    if(truncatedVersion != null) {
        versionsToCheck.push(truncatedVersion);
    }
    if(extendedVersion != null) {
        versionsToCheck.push(extendedVersion);
    }
    for(let versionToCheck of versionsToCheck) {
        console.log("#   version", versionToCheck);
    }
    for(let hit of hits) {
        console.log("#   hit", hit.g, hit.a, hit.v || hit.latestVersion);
    }
    let checkVersion = function(versionIndex, versionsToCheck, hitIndex, hits) {
        if(versionIndex >= versionsToCheck.length) {
            versionIndex = 0;
            hitIndex = hitIndex + 1;
        }
        if(hitIndex >= hits.length) {
            return;
        }
        let hit = hits[hitIndex];
        let versionToCheck = versionsToCheck[versionIndex];
        console.log("# checkVersion", 
            versionToCheck, "hit", 
            hitIndex+1, "of", hits.length, "search for", hit.g, hit.a);
        let url = "https://search.maven.org/solrsearch/select?q=g:" + 
            hit.g + "+AND+a:" + hit.a + "+AND+v:" + versionToCheck + "&core=gav";
        console.log("#   url = ", url);
        let versionSearchResponseArrived = function(resp) {
            console.log("# versionSearchResponseArrived");
            let versionHits; 
            try {
                versionHits = JSON.parse(resp).response.docs;
            }
            catch(e) {
                console.error("JSON parse error", url, resp);
                versionHits = [];
            }
            displayHits(versionHits);
            checkVersion(versionIndex+1, versionsToCheck, hitIndex, hits);
        };
        fetch(url, {agent: proxyAgent})
            .then(resp => resp.text())
                .then(versionSearchResponseArrived);
    }

    checkVersion(0, versionsToCheck, 0, hits);
    return;
}

// https://central.sonatype.org/search/rest-api-guide/
function startSearch() {
    knownCoordinates = getKnownCoordinates(searchTerm);
    let url;
    if(knownCoordinates != null) {
        url = knownCoordinates.searchUrl();
    }
    else {
        url = "https://search.maven.org/solrsearch/select?q=" + searchTerm;
    }
    console.log("# startSearch url", url);
    fetch(url, {agent: proxyAgent})
        .then(resp => resp.text())
            .then(mvnSearchResponseArrived);
}

function birtArtifactSearchResponseArrived(resp) {
    let hits; 
    try {
        hits = JSON.parse(resp).response.docs;
    }
    catch(e) {
        console.error("JSON parse error", url, resp);
        hits = [];
    }
    console.log("# birtArtifactSearchResponseArrived", hits.length);
    for(let hit of hits) {
        console.log("# hit", hit.g, hit.a, hit.v);
    }

    if (hits.length === 0) {
        if (searchTerm.trim() !== "") {
            startSearch();
        }
        return;
    }
    displayHits(hits, "4.8.0");
}

function startBirtArtifactSearch() {
    let url = "https://search.maven.org/solrsearch/select?q=g:com.innoventsolutions.birt.runtime+AND+a:" + 
        birtArtifactId + "&core=gav";
    console.log("# startBirtArtifactSearch", url);
    fetch(url, {agent: proxyAgent})
        .then(resp => resp.text())
            .then(birtArtifactSearchResponseArrived);
}

export function search(argSearchTerm, argVersion, argExtendedVersion) {
    searchTerm = argSearchTerm || '';
    requiredVersion = argVersion || '';
    truncatedVersion = null;
    if(requiredVersion != '') {
        let reResult = /^([0-9.]+)\.0$/.exec(requiredVersion);
        if(reResult != null) {
            truncatedVersion = reResult[1];
        }
    }
    extendedVersion = null;
    argExtendedVersion = argExtendedVersion || '';
    if(argExtendedVersion != '') {
        extendedVersion = requiredVersion + argExtendedVersion;
    }
    birtArtifactId = searchTerm + "_" + requiredVersion + argExtendedVersion;
    console.log("# birtArtifactId", birtArtifactId);
    console.log("# searchTerm", searchTerm);
    console.log("# requiredVersion", requiredVersion);
    console.log("# argExtendedVersion", argExtendedVersion);
    startBirtArtifactSearch();
}
