'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { 
  LayoutGrid, 
  List as ListIcon, 
  Search, 
  User, 
  Calendar, 
  Clock, 
  Play, 
  Image as ImageIcon,
  RotateCcw,
  Video,
  Loader2
} from 'lucide-react'
import { fetchPaginatedReports } from './actions'

// 1. Configurable Thumbnail Resolution (CSS/HTML sizing limit)
const THUMBNAIL_WIDTH = 384; 
const PAGE_SIZE = 12; // Fetch 12 items at a time

interface UploaderProfile {
  id: string
  name: string
  avatarUrl: string | null
  email: string
}

interface Report {
  id: string
  title: string
  video_url: string
  thumbnail_url?: string | null
  created_at: string
  status: string
  workspace_id: string
  created_by: string
  uploader?: UploaderProfile
}

interface DashboardClientProps {
  initialReports: Report[]
  hasMoreInitial: boolean
  currentUserId: string
  workspaceId: string
  workspaceMembers: UploaderProfile[]
}

export function DashboardClient({ 
  initialReports, 
  hasMoreInitial, 
  currentUserId, 
  workspaceId,
  workspaceMembers 
}: DashboardClientProps) {
  // UI states
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  
  // Search state (searchVal is local input state, searchQuery is debounced query state)
  const [searchVal, setSearchVal] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  
  // Other filters
  const [ownerFilter, setOwnerFilter] = useState('all') // 'all', 'me', or specific user ID
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  
  // Paginated data state
  const [reports, setReports] = useState<Report[]>(initialReports)
  const [hasMore, setHasMore] = useState(hasMoreInitial)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [isFiltering, setIsFiltering] = useState(false)

  // Hover playback state (only loads video on hover, saving bandwidth)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Intersection observer target
  const observerTarget = useRef<HTMLDivElement>(null)

  // Format Date & Time: "27 July, 2026 09:00 PM"
  const formatDateTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      const day = date.getDate()
      const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ]
      const month = months[date.getMonth()]
      const year = date.getFullYear()
      
      let hours = date.getHours()
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const ampm = hours >= 12 ? 'PM' : 'AM'
      hours = hours % 12
      hours = hours ? hours : 12
      
      return `${day} ${month}, ${year} ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`
    } catch (_) {
      return dateStr
    }
  }

  // Check if media URL is an image/screenshot
  const isImageReport = (url: string) => {
    if (!url) return false
    return url.includes('.png') || url.includes('.jpg') || url.includes('.jpeg') || url.startsWith('data:image/')
  }

  // 1. Debounce Search Input
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchQuery(searchVal)
    }, 300)

    return () => clearTimeout(handler)
  }, [searchVal])

  // 2. Fetch reports when filters change (Reset to Page 1)
  const isMounted = useRef(false)

  useEffect(() => {
    // Skip initial run on mount
    if (!isMounted.current) {
      isMounted.current = true
      return
    }

    let active = true
    
    async function reloadFilters() {
      setIsFiltering(true)
      try {
        const result = await fetchPaginatedReports({
          workspaceId,
          page: 1,
          pageSize: PAGE_SIZE,
          searchQuery,
          ownerFilter,
          startDate,
          endDate
        })
        if (active) {
          setReports(result.reports)
          setHasMore(result.hasMore)
          setPage(1)
        }
      } catch (err) {
        console.error("Filter reload error:", err)
      } finally {
        if (active) setIsFiltering(false)
      }
    }

    reloadFilters()

    return () => {
      active = false
    }
  }, [searchQuery, ownerFilter, startDate, endDate, workspaceId])

  // 3. Load More / Infinite Scroll trigger
  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return
    setIsLoading(true)
    
    const nextPage = page + 1
    try {
      const result = await fetchPaginatedReports({
        workspaceId,
        page: nextPage,
        pageSize: PAGE_SIZE,
        searchQuery,
        ownerFilter,
        startDate,
        endDate
      })
      
      setReports(prev => [...prev, ...result.reports])
      setHasMore(result.hasMore)
      setPage(nextPage)
    } catch (err) {
      console.error("Load more error:", err)
    } finally {
      setIsLoading(false)
    }
  }, [page, isLoading, hasMore, searchQuery, ownerFilter, startDate, endDate, workspaceId])

  // 4. Setup Intersection Observer
  useEffect(() => {
    const target = observerTarget.current
    if (!target || !hasMore || isLoading || isFiltering) return

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(target)

    return () => observer.disconnect()
  }, [hasMore, isLoading, isFiltering, loadMore])

  // Handle clear filters
  const handleClearFilters = () => {
    setSearchVal('')
    setSearchQuery('')
    setOwnerFilter('all')
    setStartDate('')
    setEndDate('')
  }

  return (
    <div className="mx-auto max-w-7xl p-8 space-y-6">
      {/* Title & View Toggle Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">Recordings</h1>
            <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-400">
              {reports.length}{hasMore ? '+' : ''}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1.5">
            Browse and search all workspace video recordings and annotated screenshots.
          </p>
        </div>

        {/* Grid/List Toggle Switch */}
        <div className="flex items-center self-start sm:self-center bg-zinc-950 border border-zinc-800 rounded-xl p-1 shrink-0">
          <button 
            onClick={() => setViewMode('grid')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'grid' 
                ? 'bg-zinc-800 text-white shadow' 
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <LayoutGrid size={14} />
            Grid
          </button>
          <button 
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'list' 
                ? 'bg-zinc-800 text-white shadow' 
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ListIcon size={14} />
            List
          </button>
        </div>
      </div>

      {/* Filter Bar Controls */}
      <div className="bg-zinc-950/40 border border-zinc-800/80 rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Search Title */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Search Title</label>
            <div className="relative">
              <input 
                type="text" 
                placeholder="Search by title..."
                value={searchVal}
                onChange={e => setSearchVal(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-xl px-3 py-2 pl-9 text-xs placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <Search className="absolute left-3 top-2.5 text-zinc-600 h-3.5 w-3.5" />
            </div>
          </div>

          {/* Owner Filter */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Uploader</label>
            <div className="relative">
              <select
                value={ownerFilter}
                onChange={e => setOwnerFilter(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-xl px-3 py-2 pl-9 text-xs appearance-none focus:outline-none focus:border-blue-500 cursor-pointer transition-colors"
              >
                <option value="all">Everyone</option>
                <option value="me">Created by me</option>
                {workspaceMembers.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <User className="absolute left-3 top-2.5 text-zinc-600 h-3.5 w-3.5" />
            </div>
          </div>

          {/* Date Range Start */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">From Date</label>
            <div className="relative">
              <input 
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-xl px-3 py-2 pl-9 text-xs focus:outline-none focus:border-blue-500 transition-colors"
              />
              <Calendar className="absolute left-3 top-2.5 text-zinc-600 h-3.5 w-3.5" />
            </div>
          </div>

          {/* Date Range End */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">To Date</label>
            <div className="relative">
              <input 
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-xl px-3 py-2 pl-9 text-xs focus:outline-none focus:border-blue-500 transition-colors"
              />
              <Calendar className="absolute left-3 top-2.5 text-zinc-600 h-3.5 w-3.5" />
            </div>
          </div>

        </div>

        {/* Clear Filters indicator */}
        {(searchVal || ownerFilter !== 'all' || startDate || endDate) && (
          <div className="flex justify-end pt-1">
            <button
              onClick={handleClearFilters}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors cursor-pointer"
            >
              <RotateCcw size={12} />
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Main recordings list rendering */}
      {reports.length === 0 && !isFiltering ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-950 border border-zinc-800 mb-4 text-zinc-500">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-zinc-200">No recordings match filters</h3>
          <p className="max-w-xs mt-2 text-xs text-zinc-500 leading-relaxed">
            Try adjusting your search terms, changing the uploader dropdown, or widening your date range.
          </p>
          <button
            onClick={handleClearFilters}
            className="mt-5 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-xs font-semibold px-4 py-2 border border-zinc-700 text-white transition-all cursor-pointer"
          >
            Clear Filters
          </button>
        </div>
      ) : isFiltering ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
          <p className="text-sm text-zinc-500">Filtering recordings...</p>
        </div>
      ) : viewMode === 'grid' ? (
        
        /* GRID VIEW LAYOUT */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reports.map((report) => {
            const isImg = isImageReport(report.video_url)
            const isHovered = hoveredId === report.id

            return (
              <a 
                key={report.id} 
                href={`/reports/${report.id}`} 
                className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950 transition-all hover:border-zinc-700 hover:shadow-2xl hover:shadow-black/70"
                onMouseEnter={() => setHoveredId(report.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Thumbnail Preview Area */}
                <div 
                  className="relative aspect-video w-full bg-zinc-950 overflow-hidden shrink-0 border-b border-zinc-800/80 flex items-center justify-center"
                  style={{ maxWidth: '100%' }}
                >
                  {isHovered && !isImg ? (
                    <video 
                      src={report.video_url} 
                      autoPlay
                      muted 
                      loop
                      playsInline
                      className="w-full h-full object-cover" 
                    />
                  ) : report.thumbnail_url ? (
                    <img 
                      src={report.thumbnail_url} 
                      alt={report.title} 
                      width={THUMBNAIL_WIDTH}
                      className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]" 
                    />
                  ) : isImg ? (
                    <img 
                      src={report.video_url} 
                      alt={report.title} 
                      width={THUMBNAIL_WIDTH}
                      className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]" 
                    />
                  ) : (
                    <div className="w-full h-full relative">
                      <video 
                        src={report.video_url} 
                        preload="metadata" 
                        muted 
                        playsInline
                        className="w-full h-full object-cover" 
                      />
                    </div>
                  )}
                  
                  {/* Hover Indicator Icon */}
                  {!isImg && (
                    <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md border border-white/10 rounded-lg p-1.5 text-zinc-300 opacity-60 group-hover:opacity-100 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-md">
                      <Video size={13} />
                    </div>
                  )}
                  
                  {/* Badge indicating type */}
                  <div className="absolute top-3 left-3 bg-zinc-950/75 backdrop-blur-md border border-zinc-800 rounded-lg px-2 py-1 text-[10px] font-bold tracking-wide uppercase flex items-center gap-1.5 shadow-sm text-zinc-300">
                    {isImg ? (
                      <>
                        <ImageIcon size={10} className="text-blue-400" />
                        Screenshot
                      </>
                    ) : (
                      <>
                        <Play size={10} className="text-blue-400 fill-blue-400/20" />
                        Video
                      </>
                    )}
                  </div>
                </div>

                {/* Metadata & Creator info */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                  <h3 className="font-semibold text-sm text-zinc-100 line-clamp-1 group-hover:text-white transition-colors">
                    {report.title || 'Untitled Recording'}
                  </h3>
                  
                  {/* Footer creator block */}
                  <div className="flex items-center justify-between border-t border-zinc-900 pt-3.5">
                    {/* User profile info */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      {report.uploader?.avatarUrl ? (
                        <img 
                          src={report.uploader.avatarUrl} 
                          alt={report.uploader.name} 
                          className="w-6.5 h-6.5 rounded-full border border-zinc-800 shrink-0"
                        />
                      ) : (
                        <div className="w-6.5 h-6.5 rounded-full bg-gradient-to-tr from-blue-500 to-blue-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0 border border-blue-500/20 uppercase shadow-md shadow-blue-600/10">
                          {report.uploader?.name.charAt(0) || 'U'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-zinc-200 truncate">{report.uploader?.name}</p>
                        <p className="text-[9px] text-zinc-500 truncate">{report.uploader?.email}</p>
                      </div>
                    </div>

                    {/* Date/Time block */}
                    <div className="text-right shrink-0">
                      <p className="text-[9px] font-medium text-zinc-400 flex items-center gap-1 justify-end">
                        <Clock size={9} className="text-zinc-500" />
                        {formatDateTime(report.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              </a>
            )
          })}
        </div>
      ) : (
        
        /* LIST VIEW LAYOUT */
        <div className="border border-zinc-800/80 rounded-2xl bg-zinc-950 overflow-hidden divide-y divide-zinc-900 shadow-xl">
          {reports.map((report) => {
            const isImg = isImageReport(report.video_url)
            const isHovered = hoveredId === report.id

            return (
              <a 
                key={report.id} 
                href={`/reports/${report.id}`} 
                className="group flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-4 transition-colors hover:bg-zinc-900/30"
                onMouseEnter={() => setHoveredId(report.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Left side: Thumbnail preview + title details */}
                <div className="flex items-start gap-4 min-w-0 flex-1">
                  
                  {/* Thumbnail Container */}
                  <div 
                    className="relative aspect-video w-36 h-20 rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 shrink-0 flex items-center justify-center"
                    style={{ width: 144, height: 80 }}
                  >
                    {isHovered && !isImg ? (
                      <video 
                        src={report.video_url} 
                        autoPlay
                        muted 
                        loop
                        playsInline
                        className="w-full h-full object-cover" 
                      />
                    ) : report.thumbnail_url ? (
                      <img 
                        src={report.thumbnail_url} 
                        alt={report.title} 
                        width={THUMBNAIL_WIDTH}
                        className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105" 
                      />
                    ) : isImg ? (
                      <img 
                        src={report.video_url} 
                        alt={report.title} 
                        width={THUMBNAIL_WIDTH}
                        className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105" 
                      />
                    ) : (
                      <div className="w-full h-full relative">
                        <video 
                          src={report.video_url} 
                          preload="metadata" 
                          muted 
                          playsInline
                          className="w-full h-full object-cover" 
                        />
                      </div>
                    )}
                    
                    {!isImg && (
                      <div className="absolute bottom-1.5 right-1.5 bg-black/70 backdrop-blur-md rounded-md p-1 text-zinc-400 group-hover:text-white group-hover:bg-blue-600 transition-all">
                        <Video size={10} />
                      </div>
                    )}
                  </div>

                  {/* Title & Type Info */}
                  <div className="min-w-0 py-1.5">
                    <h3 className="font-semibold text-sm text-zinc-100 group-hover:text-white truncate">
                      {report.title || 'Untitled Recording'}
                    </h3>
                    
                    <div className="flex items-center gap-2 mt-2">
                      {/* Mini Type Badge */}
                      <span className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-[9px] font-bold text-zinc-400 uppercase tracking-wide">
                        {isImg ? 'Screenshot' : 'Video'}
                      </span>
                      
                      <span className="text-[10px] text-zinc-500">•</span>
                      
                      {/* Creator name */}
                      <span className="text-[10px] text-zinc-400 font-medium truncate">
                        By {report.uploader?.name}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right side: Uploader profile pfp & Detailed DateTime */}
                <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto border-t border-zinc-900/60 pt-3 sm:pt-0 sm:border-0 shrink-0">
                  
                  {/* Creator details */}
                  <div className="flex items-center gap-2">
                    {report.uploader?.avatarUrl ? (
                      <img 
                        src={report.uploader.avatarUrl} 
                        alt={report.uploader.name} 
                        className="w-6 h-6 rounded-full border border-zinc-800"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-500 to-blue-600 flex items-center justify-center text-[9px] font-bold text-white uppercase border border-blue-500/20">
                        {report.uploader?.name.charAt(0) || 'U'}
                      </div>
                    )}
                    <span className="text-xs text-zinc-400 font-medium hidden md:inline truncate max-w-[120px]">
                      {report.uploader?.name}
                    </span>
                  </div>

                  {/* Date Time format */}
                  <div className="text-right flex items-center gap-1.5 text-xs text-zinc-400 font-medium">
                    <Clock size={11} className="text-zinc-500" />
                    <span>{formatDateTime(report.created_at)}</span>
                  </div>

                </div>
              </a>
            )
          })}
        </div>
      )}

      {/* Infinite Scroll trigger target */}
      {hasMore && !isFiltering && (
        <div ref={observerTarget} className="flex justify-center py-8">
          {isLoading && (
            <div className="flex items-center gap-2 text-zinc-400 text-xs font-semibold">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              Loading more recordings...
            </div>
          )}
        </div>
      )}
    </div>
  )
}
