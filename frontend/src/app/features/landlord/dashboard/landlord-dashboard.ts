import { Component, OnInit, signal, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ToastService } from '../../../shared/services/toast.service';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-landlord-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './landlord-dashboard.html'
})
export class LandlordDashboardComponent implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('revenueChart') revenueChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('occupancyChart') occupancyChartRef!: ElementRef<HTMLCanvasElement>;

  // Signals for real data
  totalProperties = signal(0);
  totalUnits = signal(0);
  activeTenants = signal(0);
  monthlyRevenue = signal(0);
  currentMonthRevenue = signal(0);
  occupancyRate = signal(0);
  occupiedUnitsCount = signal(0);

  // Animated display values for summary cards
  displayTotalProperties = signal(0);
  displayTotalUnits = signal(0);
  displayActiveTenants = signal(0);
  displayMonthlyRevenue = signal(0);
  displayOccupancyRate = signal(0);

  recentApplications = signal<any[]>([]);
  recentPayments = signal<any[]>([]);
  overdueBills = signal<any[]>([]);

  private revenueChart: Chart | null = null;
  private occupancyChart: Chart | null = null;
  private realtimeChannels: any[] = [];
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private animationFrameIds: number[] = [];
  private isViewReady = false;
  private hasAnimatedChartsOnce = false;
  private pendingChartData: { revenueSeries: Array<{ label: string; value: number }>; occupiedUnits: number; totalUnits: number } | null = null;
  private readonly dashboardCacheKey = 'landlord_dashboard_cache_v1';
  today = new Date();

  constructor(
    private supabaseService: SupabaseService,
    private toastService: ToastService,
    private router: Router
  ) {}

  async ngOnInit() {
    this.hydrateDashboardFromCache();
    await this.loadDashboardData();
    await this.setupRealtime();
  }

  ngAfterViewInit() {
    this.isViewReady = true;

    if (this.pendingChartData) {
      this.createCharts(
        this.pendingChartData.revenueSeries,
        this.pendingChartData.occupiedUnits,
        this.pendingChartData.totalUnits
      );
      this.pendingChartData = null;
    }
  }

  ngOnDestroy() {
    this.stopMetricAnimations();

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    this.realtimeChannels.forEach((channel) => {
      this.supabaseService.client.removeChannel(channel);
    });
    this.realtimeChannels = [];

    if (this.revenueChart) {
      this.revenueChart.destroy();
      this.revenueChart = null;
    }

    if (this.occupancyChart) {
      this.occupancyChart.destroy();
      this.occupancyChart = null;
    }
  }

  private stopMetricAnimations() {
    this.animationFrameIds.forEach((frameId) => cancelAnimationFrame(frameId));
    this.animationFrameIds = [];
  }

  private animateSignal(
    signalRef: { set: (value: number) => void },
    from: number,
    to: number,
    duration = 900
  ) {
    const start = performance.now();
    const delta = to - from;

    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      signalRef.set(Math.round(from + delta * eased));

      if (progress < 1) {
        const id = requestAnimationFrame(step);
        this.animationFrameIds.push(id);
      }
    };

    const id = requestAnimationFrame(step);
    this.animationFrameIds.push(id);
  }

  private animateSummaryCards() {
    this.stopMetricAnimations();

    this.animateSignal(this.displayTotalProperties, this.displayTotalProperties(), this.totalProperties());
    this.animateSignal(this.displayTotalUnits, this.displayTotalUnits(), this.totalUnits());
    this.animateSignal(this.displayActiveTenants, this.displayActiveTenants(), this.activeTenants());
    this.animateSignal(this.displayMonthlyRevenue, this.displayMonthlyRevenue(), this.monthlyRevenue());
    this.animateSignal(this.displayOccupancyRate, this.displayOccupancyRate(), this.occupancyRate());
  }

  private renderChartsSync(
    revenueSeries: Array<{ label: string; value: number }>,
    occupiedUnits: number,
    totalUnits: number
  ) {
    if (!this.isViewReady || !this.revenueChartRef || !this.occupancyChartRef) {
      this.pendingChartData = { revenueSeries, occupiedUnits, totalUnits };
      return;
    }

    this.createCharts(revenueSeries, occupiedUnits, totalUnits);
  }

  private toLocalDateString(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private toLocalMonthKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private hydrateDashboardFromCache() {
    try {
      if (typeof window === 'undefined') return;

      const raw = window.localStorage.getItem(this.dashboardCacheKey);
      if (!raw) return;

      const cached = JSON.parse(raw) as {
        totalProperties: number;
        totalUnits: number;
        activeTenants: number;
        monthlyRevenue: number;
        currentMonthRevenue: number;
        occupancyRate: number;
        occupiedUnitsCount: number;
        revenueSeries: Array<{ label: string; value: number }>;
      };

      this.totalProperties.set(cached.totalProperties || 0);
      this.totalUnits.set(cached.totalUnits || 0);
      this.activeTenants.set(cached.activeTenants || 0);
      this.monthlyRevenue.set(cached.monthlyRevenue || 0);
      const fallbackMonthlyFromTrend = (cached.revenueSeries && cached.revenueSeries.length > 0)
        ? Number(cached.revenueSeries[cached.revenueSeries.length - 1].value || 0)
        : 0;
      this.currentMonthRevenue.set(cached.currentMonthRevenue ?? fallbackMonthlyFromTrend);
      this.occupancyRate.set(cached.occupancyRate || 0);
      this.occupiedUnitsCount.set(cached.occupiedUnitsCount || 0);

      this.animateSummaryCards();
      this.renderChartsSync(cached.revenueSeries || [], cached.occupiedUnitsCount || 0, cached.totalUnits || 0);
    } catch {
      // Ignore cache parse/runtime errors.
    }
  }

  private persistDashboardCache(revenueSeries: Array<{ label: string; value: number }>) {
    try {
      if (typeof window === 'undefined') return;

      const payload = {
        totalProperties: this.totalProperties(),
        totalUnits: this.totalUnits(),
        activeTenants: this.activeTenants(),
        monthlyRevenue: this.monthlyRevenue(),
        currentMonthRevenue: this.currentMonthRevenue(),
        occupancyRate: this.occupancyRate(),
        occupiedUnitsCount: this.occupiedUnitsCount(),
        revenueSeries,
        updatedAt: Date.now()
      };

      window.localStorage.setItem(this.dashboardCacheKey, JSON.stringify(payload));
    } catch {
      // Ignore storage quota/runtime errors.
    }
  }

  private scheduleRealtimeRefresh() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(() => {
      this.loadDashboardData();
    }, 500);
  }

  private async setupRealtime() {
    const channel = this.supabaseService.client
      .channel('landlord-dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'properties' },
        () => this.scheduleRealtimeRefresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'units' },
        () => this.scheduleRealtimeRefresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rentals' },
        () => this.scheduleRealtimeRefresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'billings' },
        () => this.scheduleRealtimeRefresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments' },
        () => this.scheduleRealtimeRefresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tenant_applications' },
        () => this.scheduleRealtimeRefresh()
      )
      .subscribe();

    this.realtimeChannels.push(channel);
  }

  async loadDashboardData() {
    try {
      const user = await this.supabaseService.getCurrentUser();
      if (!user) return;

      const { data: properties, error: propertiesError } = await this.supabaseService.client
        .from('properties')
        .select('id, total_units, name')
        .eq('landlord_id', user.id);

      if (propertiesError) throw propertiesError;

      const propertyIds = (properties || []).map((property: any) => property.id);

      this.totalProperties.set(properties?.length || 0);
      this.totalUnits.set(0);

      if (propertyIds.length === 0) {
        this.activeTenants.set(0);
        this.monthlyRevenue.set(0);
        this.currentMonthRevenue.set(0);
        this.occupancyRate.set(0);
        this.occupiedUnitsCount.set(0);
        this.recentApplications.set([]);
        this.recentPayments.set([]);
        this.overdueBills.set([]);
        this.animateSummaryCards();
        this.renderChartsSync([], 0, 0);
        return;
      }

      const { data: units, error: unitsError } = await this.supabaseService.client
        .from('units')
        .select('id, property_id')
        .in('property_id', propertyIds);

      if (unitsError) throw unitsError;

      const unitIds = (units || []).map((unit: any) => unit.id);
      this.totalUnits.set(unitIds.length);

      if (unitIds.length === 0) {
        this.activeTenants.set(0);
        this.monthlyRevenue.set(0);
        this.currentMonthRevenue.set(0);
        this.occupancyRate.set(0);
        this.occupiedUnitsCount.set(0);
        this.recentApplications.set([]);
        this.recentPayments.set([]);
        this.overdueBills.set([]);
        this.animateSummaryCards();
        this.renderChartsSync([], 0, this.totalUnits());
        return;
      }

      const monthStart = new Date();
      monthStart.setDate(1);

      const sixMonthsAgo = new Date(monthStart);
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);

      const sixMonthsAgoIso = this.toLocalDateString(sixMonthsAgo);

      // Run metric sources in parallel so the first dashboard animation starts sooner.
      const [approvedResult, billingsResult, totalRevenueResult] = await Promise.all([
        this.supabaseService.client
          .from('tenant_applications')
          .select('tenant_id, unit_id')
          .in('unit_id', unitIds)
          .eq('status', 'approved'),
        this.supabaseService.client
          .from('billings')
          .select('id, total_amount, billing_month, status, due_date')
          .eq('status', 'paid')
          .gte('billing_month', sixMonthsAgoIso)
          .order('billing_month', { ascending: true }),
        this.supabaseService.client
          .from('billings')
          .select('total_amount')
          .eq('status', 'paid')
          .order('billing_month', { ascending: true })
      ]);

      if (approvedResult.error) throw approvedResult.error;
      if (billingsResult.error) throw billingsResult.error;
      if (totalRevenueResult.error) throw totalRevenueResult.error;

      const approvedTenantIds = new Set(
        (approvedResult.data || []).map((application: any) => application.tenant_id)
      );
      this.activeTenants.set(approvedTenantIds.size);

      const approvedOccupiedUnits = new Set(
        (approvedResult.data || []).map((application: any) => application.unit_id)
      );
      this.occupiedUnitsCount.set(approvedOccupiedUnits.size);

      const paidBillings = billingsResult.data || [];

      const monthlyRevenueMap = new Map<string, number>();

      paidBillings.forEach((billing: any) => {
        const monthKey = String(billing.billing_month).slice(0, 7);
        const amount = Number(billing.total_amount || 0);
        monthlyRevenueMap.set(monthKey, (monthlyRevenueMap.get(monthKey) || 0) + amount);
      });

      const revenueSeries: { label: string; value: number }[] = [];
      for (let i = 0; i < 6; i++) {
        const monthDate = new Date(sixMonthsAgo);
        monthDate.setMonth(sixMonthsAgo.getMonth() + i);
        const key = this.toLocalMonthKey(monthDate);
        const label = monthDate.toLocaleString('en-US', { month: 'short' });
        revenueSeries.push({ label, value: monthlyRevenueMap.get(key) || 0 });
      }

      // Revenue card shows all-time paid revenue.
      const totalRevenueAllTime = (totalRevenueResult.data || []).reduce(
        (sum: number, billing: any) => sum + Number(billing.total_amount || 0),
        0
      );

      this.monthlyRevenue.set(totalRevenueAllTime);

      // Keep subtitle aligned with the visible Revenue Trend rightmost bar.
      const monthlyFromTrend = revenueSeries.length > 0
        ? Number(revenueSeries[revenueSeries.length - 1].value || 0)
        : 0;
      this.currentMonthRevenue.set(monthlyFromTrend);

      // 6. Occupancy Rate
      const occupancy = this.totalUnits() > 0 
        ? Math.round((approvedOccupiedUnits.size / this.totalUnits()) * 100) 
        : 0;
      this.occupancyRate.set(occupancy);

      // Start card and chart animations together.
      this.animateSummaryCards();
      this.renderChartsSync(revenueSeries, approvedOccupiedUnits.size, this.totalUnits());
      this.persistDashboardCache(revenueSeries);

      // 7. Load recent cards/lists
      await this.loadRecentData(user.id, propertyIds, unitIds);

    } catch (error) {
      console.error('Dashboard data error:', error);
      this.toastService.error('Failed to load dashboard data');
    }
  }

  async loadRecentData(userId: string, propertyIds: string[], unitIds: string[]) {
    if (propertyIds.length === 0 || unitIds.length === 0) {
      this.recentApplications.set([]);
      this.recentPayments.set([]);
      this.overdueBills.set([]);
      return;
    }

    // Recent applications scoped by unit ids from landlord properties
    const { data: apps } = await this.supabaseService.client
      .from('tenant_applications')
      .select(`
        id,
        status,
        application_date,
        tenant:tenant_id (full_name),
        unit:unit_id (
          room_number,
          property:property_id (name)
        )
      `)
      .in('unit_id', unitIds)
      .order('application_date', { ascending: false })
      .limit(5);

    this.recentApplications.set(apps || []);

    const { data: payments } = await this.supabaseService.client
      .from('payments')
      .select(`
        id,
        amount,
        method,
        payment_date,
        status,
        tenant:tenant_id (full_name),
        billing:billing_id (
          property_id,
          unit_id,
          property:property_id (name),
          unit:unit_id (room_number)
        )
      `)
      .order('payment_date', { ascending: false })
      .limit(10);

    const filteredPayments = (payments || []).filter((payment: any) =>
      propertyIds.includes(payment?.billing?.property_id)
    );

    if (filteredPayments.length > 0) {
      this.recentPayments.set(filteredPayments.slice(0, 5));
    } else {
      const { data: paidBillings } = await this.supabaseService.client
        .from('billings')
        .select(`
          id,
          total_amount,
          payment_method,
          updated_at,
          tenant:tenant_id (full_name),
          property:property_id (name),
          unit:unit_id (room_number)
        `)
        .in('property_id', propertyIds)
        .eq('status', 'paid')
        .order('updated_at', { ascending: false })
        .limit(5);

      const fallbackPayments = (paidBillings || []).map((bill: any) => ({
        id: bill.id,
        amount: bill.total_amount,
        method: bill.payment_method || 'completed',
        payment_date: bill.updated_at,
        tenant: bill.tenant,
        billing: {
          property: bill.property,
          unit: bill.unit,
          property_id: null
        }
      }));

      this.recentPayments.set(fallbackPayments);
    }

    // Overdue bills scoped to landlord properties
    const todayIso = new Date().toISOString().slice(0, 10);

    const { data: overdue } = await this.supabaseService.client
      .from('billings')
      .select(`
        id,
        due_date,
        total_amount,
        status,
        tenant:tenant_id (full_name),
        property:property_id (name),
        unit:unit_id (room_number)
      `)
      .in('property_id', propertyIds)
      .lt('due_date', todayIso)
      .neq('status', 'paid')
      .order('due_date', { ascending: true })
      .limit(5);

    this.overdueBills.set(overdue || []);
  }

  createCharts(
    revenueSeries: Array<{ label: string; value: number }>,
    occupiedUnits: number,
    totalUnits: number
  ) {
    const shouldAnimate = !this.hasAnimatedChartsOnce;

    // Revenue Trend Chart
    if (this.revenueChartRef) {
      if (this.revenueChart) this.revenueChart.destroy();

      this.revenueChart = new Chart(this.revenueChartRef.nativeElement, {
        type: 'bar',
        data: {
          labels: revenueSeries.map((item) => item.label),
          datasets: [{
            label: 'Revenue (₱)',
            data: revenueSeries.map((item) => item.value),
            backgroundColor: '#10b981',
            borderRadius: 12,
            borderSkipped: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              beginAtZero: true
            }
          },
          animations: {
            y: {
              from: 0,
              duration: shouldAnimate ? 1500 : 0,
              easing: 'easeOutCubic',
              delay(context) {
                if (!shouldAnimate) return 0;
                return context.type === 'data' ? context.dataIndex * 120 : 0;
              }
            },
            x: {
              from: 0,
              duration: shouldAnimate ? 600 : 0,
              easing: 'easeOutCubic'
            }
          }
        }
      });
    }

    // Occupancy Rate Chart
    if (this.occupancyChartRef) {
      if (this.occupancyChart) this.occupancyChart.destroy();

      const availableUnits = Math.max(totalUnits - occupiedUnits, 0);

      this.occupancyChart = new Chart(this.occupancyChartRef.nativeElement, {
        type: 'doughnut',
        data: {
          labels: ['Occupied', 'Available'],
          datasets: [{
            data: [occupiedUnits, availableUnits],
            backgroundColor: ['#10b981', '#e5e7eb']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '72%',
          animation: {
            duration: shouldAnimate ? 1300 : 0,
            easing: 'easeOutQuart'
          }
        }
      });
    }

    this.hasAnimatedChartsOnce = true;
  }

  goToProperties() {
    this.router.navigate(['/landlord/properties']);
  }

  goToApplications() {
    this.router.navigate(['/landlord/applications']);
  }

  goToBilling() {
    this.router.navigate(['/landlord/billing']);
  }
}