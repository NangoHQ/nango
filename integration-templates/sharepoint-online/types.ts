interface SharePointIds {
    listId: string;
    listItemId: string;
    listItemUniqueId: string;
    siteId: string;
    siteUrl: string;
    tenantId: string;
    webId: string;
}

interface SiteCollection {
    dataLocationCode?: string;
    hostname: string;
    root?: object;
    archivalDetails?: SiteArchivalDetails;
}
interface SiteArchivalDetails {
    archiveStatus: 'recentlyArchived' | 'fullyArchived' | 'reactivating' | 'unknownFutureValue';
}

interface IdentitySet {
    application?: Identity;
    applicationInstance?: Identity;
    conversation?: Identity;
    conversationIdentityType?: Identity;
    device?: Identity;
    encrypted?: Identity;
    onPremises?: Identity;
    guest?: Identity;
    phone?: Identity;
    user?: Identity;
}

interface Identity {
    id: string;
    displayName: string;
    tenantId?: string;
}

interface AudioFacet {
    album: string;
    albumArtist: string;
    artist: string;
    bitrate: number;
    composers: string;
    copyright: string;
    disc: number;
    discCount: number;
    duration: number;
    genre: string;
    hasDrm: boolean;
    isVariableBitrate: boolean;
    title: string;
    track: number;
    trackCount: number;
    year: number;
}
interface BundleFacet {
    album?: object;
    childCount: number;
}

interface DeletedFacet {
    state: string;
}

interface FileFacet {
    hashes?: object;
    mimeType: string;
}

interface FileSystemInfo {
    createdDateTime: string;
    lastAccessedDateTime?: string;
    lastModifiedDateTime: string;
}

interface FolderFacet {
    childCount: number;
    view: FolderView;
}

interface FolderView {
    sortBy: 'default' | 'name' | 'type' | 'size' | 'takenOrCreatedDateTime' | 'lastModifiedDateTime' | 'sequence';
    sortOrder: 'ascending' | 'descending';
    viewType: 'default' | 'icons' | 'details' | 'thumbnails';
}

interface ImageFacet {
    height?: number;
    width?: number;
}

interface GeoCoordinates {
    altitude?: number;
    latitude?: number;
    longitude?: number;
}

interface MalwareFacet {
    description: string;
}

interface PackageFacet {
    type: string;
}

interface ItemReference {
    driveId: string;
    driveType: 'personal' | 'business' | 'documentLibrary';
    id: string;
    name: string;
    path: string;
    shareId: string;
    sharepointIds: SharePointIds;
    siteId: string;
}

interface PendingOperations {
    pendingContentUpdate: object;
}

interface PhotoFacet {
    cameraMake: string;
    cameraModel: string;
    exposureDenominator: number;
    exposureNumerator: number;
    fNumber: number;
    focalLength: number;
    iso: number;
    orientation: number;
    takenDateTime: string;
}

interface PublicationFacet {
    level: 'published' | 'checkout';
    versionId: string;
    checkedOutBy: IdentitySet;
}

interface RemoteItemFacet {
    level: 'published' | 'checkout';
    versionId: string;
    checkedOutBy: IdentitySet;
}

interface SearchResultFacet {
    onClickTelemetryUrl: string;
}

interface SharedFacet {
    owner: IdentitySet;
    sharedBy: IdentitySet;
    sharedDateTime: string;
}

interface SpecialFolderFacet {
    name: string;
}

interface VideoFacet {
    audioBitsPerSample: number;
    audioChannels: number;
    audioFormat: string;
    audioSamplesPerSecond: number;
    bitrate: number;
    duration: number;
    fourCC: string;
    frameRate: number;
    height: number;
    width: number;
}

export interface SharePointSite {
    createdDateTime: string;
    description?: string;
    displayName?: string;
    eTag?: string;
    id: string;
    isPersonalSite?: boolean;
    lastModifiedDateTime: string;
    name: string;
    root?: object;
    sharepointIds?: SharePointIds;
    siteCollection?: SiteCollection;
    webUrl: string;
}

export interface DriveItem {
    '@odata.context': string;
    '@microsoft.graph.downloadUrl': string;
    '@microsoft.graph.Decorator': string; // Deprecated;
    audio?: AudioFacet;
    bundle?: BundleFacet;
    content?: any;
    createdBy: IdentitySet;
    createdDateTime: string;
    cTag: string;
    deleted?: DeletedFacet;
    description?: string;
    eTag: string;
    file?: FileFacet;
    fileSystemInfo?: FileSystemInfo;
    folder?: FolderFacet;
    id: string;
    image?: ImageFacet;
    lastModifiedBy: IdentitySet;
    lastModifiedDateTime: string;
    location?: GeoCoordinates;
    malware?: MalwareFacet;
    name: string;
    package?: PackageFacet;
    parentReference: ItemReference;
    pendingOperations?: PendingOperations;
    photo?: PhotoFacet;
    publication?: PublicationFacet;
    remoteItem?: RemoteItemFacet;
    root?: object;
    searchResult?: SearchResultFacet;
    shared?: SharedFacet;
    sharepointIds?: SharePointIds;
    size: number;
    specialFolder?: SpecialFolderFacet;
    video?: VideoFacet;
    webDavUrl?: string;
    webUrl?: string;
}
