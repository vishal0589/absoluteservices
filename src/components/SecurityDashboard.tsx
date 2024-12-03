import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  Clock, MapPin, User, AlertTriangle, Shield, Activity, Search
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { parse } from 'papaparse';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// Type definitions
interface ActivityRecord {
  'Service Number': string;
  'User Name': string;
  'Date/Time': string;
  'Activity': string;
  'Post Name': string;
  'Location Accuracy': string;
  'Time Accuracy': string;
}

interface AttendanceRecord {
  'Login Date': string;
  'Post Name': string;
  'Shift Time': string;
  'Full Name': string;
  'Service Number': string;
  'Late Hours': string;
  'Excess Hours': string;
  'No of Miss': string;
}

interface GuardStats {
  id: string;
  name: string;
  post: string;
  activities: number;
  locationAccuracy: number;
  locationIssues: number;
  onTime: boolean;
  missedScans: number;
  lastActivity: string;
  status: 'normal' | 'warning';
}

interface LocationStats {
  name: string;
  totalScans: number;
  accuracyIssues: number;
  avgAccuracy: number;
  coverageRate: number;
}

interface Metrics {
  totalGuards: number;
  onTimeRate: number;
  lateCheckIns: number;
  earlyCheckouts: number;
  locationErrors: number;
  avgLocationAccuracy: number;
  totalShifts: number;
  missedScans: number;
}

interface ActivityData {
  hour: number;
  count: number;
  locationIssues: number;
}

interface TabProps {
  id: string;
  label: string;
  icon: React.FC<{ className?: string }>;
}

const TABS: TabProps[] = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'guards', label: 'Guards', icon: Shield },
  { id: 'locations', label: 'Locations', icon: MapPin }
];

const SecurityDashboard: React.FC = () => {
  // State management
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'guards' | 'locations'>('overview');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [metrics, setMetrics] = useState<Metrics>({
    totalGuards: 0,
    onTimeRate: 0,
    lateCheckIns: 0,
    earlyCheckouts: 0,
    locationErrors: 0,
    avgLocationAccuracy: 0,
    totalShifts: 0,
    missedScans: 0
  });
  const [guardStats, setGuardStats] = useState<GuardStats[]>([]);
  const [activityData, setActivityData] = useState<ActivityData[]>([]);
  const [locationStats, setLocationStats] = useState<LocationStats[]>([]);

  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  // Raw data
  const [activityDataRaw, setActivityDataRaw] = useState<ActivityRecord[]>([]);
  const [attendanceDataRaw, setAttendanceDataRaw] = useState<AttendanceRecord[]>([]);

  // Drill-Down states
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);

  // Process Activity Data
  const processActivityData = (data: ActivityRecord[]): void => {
    const hourlyData = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: 0,
      locationIssues: 0
    }));

    const uniqueGuards = new Set<string>();
    let totalLocationAccuracy = 0;
    let locationReadings = 0;
    let locationIssues = 0;
    const guardMetrics: { [key: string]: GuardStats } = {};

    data.forEach(activity => {
      if (!activity['Date/Time']) return;

      const date = new Date(activity['Date/Time']);
      const hour = date.getHours();
      hourlyData[hour].count++;

      // Track unique guards and their metrics
      if (activity['Service Number']) {
        uniqueGuards.add(activity['Service Number']);

        if (!guardMetrics[activity['Service Number']]) {
          guardMetrics[activity['Service Number']] = {
            id: activity['Service Number'],
            name: activity['User Name'],
            post: activity['Post Name'],
            activities: 0,
            locationAccuracy: 0,
            locationIssues: 0,
            onTime: activity['Time Accuracy'] === 'On Time',
            missedScans: 0,
            lastActivity: activity['Date/Time'],
            status: 'normal'
          };
        }

        const guard = guardMetrics[activity['Service Number']];
        guard.activities++;

        // Update last activity if current activity is more recent
        if (new Date(activity['Date/Time']) > new Date(guard.lastActivity)) {
          guard.lastActivity = activity['Date/Time'];
        }
      }

      // Process location accuracy
      if (activity['Location Accuracy']) {
        const accuracyMatch = activity['Location Accuracy'].match(/\d+/);
        if (accuracyMatch) {
          const accuracy = parseInt(accuracyMatch[0]);
          totalLocationAccuracy += accuracy;
          locationReadings++;

          if (accuracy > 50) {
            locationIssues++;
            hourlyData[hour].locationIssues++;
            if (activity['Service Number']) {
              guardMetrics[activity['Service Number']].locationIssues++;
              guardMetrics[activity['Service Number']].locationAccuracy = accuracy;
            }
          }
        }
      }
    });

    // Update states with processed data
    setActivityData(hourlyData);
    setGuardStats(Object.values(guardMetrics).map(guard => ({
      ...guard,
      status: guard.locationIssues > 0 || !guard.onTime ? 'warning' : 'normal'
    })));

    setMetrics(prev => ({
      ...prev,
      totalGuards: uniqueGuards.size,
      locationErrors: locationIssues,
      avgLocationAccuracy: locationReadings ? Math.round(totalLocationAccuracy / locationReadings) : 0
    }));
  };

  // Process Attendance Data
  const processAttendanceData = (data: AttendanceRecord[]): void => {
    const locationCoverage: { [key: string]: LocationStats } = {};
    let totalShifts = 0;
    let onTime = 0;
    let late = 0;
    let missedScans = 0;

    data.forEach(record => {
      if (!record['Post Name']) return;

      totalShifts++;
      if (record['Late Hours'] === 'On-time') {
        onTime++;
      } else {
        late++;
      }

      missedScans += parseInt(record['No of Miss'] || '0');

      // Process location statistics
      const location = record['Post Name'];
      if (!locationCoverage[location]) {
        locationCoverage[location] = {
          name: location,
          totalScans: 0,
          accuracyIssues: 0,
          avgAccuracy: 0,
          coverageRate: 0
        };
      }

      locationCoverage[location].totalScans++;
      if (record['Late Hours'] !== 'On-time') {
        locationCoverage[location].accuracyIssues++;
      }
    });

    // Calculate coverage rates
    Object.values(locationCoverage).forEach(location => {
      location.coverageRate = Math.round(
        ((location.totalScans - location.accuracyIssues) / location.totalScans) * 100
      );
    });

    setLocationStats(Object.values(locationCoverage));
    setMetrics(prev => ({
      ...prev,
      totalShifts,
      onTimeRate: Math.round((onTime / totalShifts) * 100),
      lateCheckIns: late,
      missedScans,
      earlyCheckouts: late // Assuming early checkouts are same as late check-ins for this example
    }));
  };

  // Fetch data once
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Load Activity Report
        const activityResponse = await fetch('/data/Activity-Report.csv');
        if (!activityResponse.ok) throw new Error('Failed to load activity data');
        const activityText = await activityResponse.text();
        const activityResults = parse<ActivityRecord>(activityText, {
          header: true,
          skipEmptyLines: true
        });

        // Load Attendance Report
        const attendanceResponse = await fetch('/data/Post-basis-attendance.csv');
        if (!attendanceResponse.ok) throw new Error('Failed to load attendance data');
        const attendanceText = await attendanceResponse.text();
        const attendanceResults = parse<AttendanceRecord>(attendanceText, {
          header: true,
          skipEmptyLines: true
        });

        // Store raw data
        setActivityDataRaw(activityResults.data);
        setAttendanceDataRaw(attendanceResults.data);

      } catch (error) {
        setError(error instanceof Error ? error.message : 'Error loading dashboard data');
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Process data based on date range
  useEffect(() => {
    if (!activityDataRaw.length || !attendanceDataRaw.length) return;

    // Filter data based on date range
    const filteredActivityData = activityDataRaw.filter(activity => {
      if (!activity['Date/Time']) return false;
      const activityDate = new Date(activity['Date/Time']);
      if (startDate && activityDate < startDate) return false;
      if (endDate && activityDate > endDate) return false;
      return true;
    });

    const filteredAttendanceData = attendanceDataRaw.filter(record => {
      if (!record['Login Date']) return false;
      const loginDate = new Date(record['Login Date']);
      if (startDate && loginDate < startDate) return false;
      if (endDate && loginDate > endDate) return false;
      return true;
    });

    processActivityData(filteredActivityData);
    processAttendanceData(filteredAttendanceData);

  }, [activityDataRaw, attendanceDataRaw, startDate, endDate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl font-semibold">Loading dashboard data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen text-red-600">
        <div>Error loading dashboard: {error}</div>
      </div>
    );
  }

  // Drill-Down Components
  const renderDrillDownContent = () => {
    if (selectedHour !== null) {
      // Show detailed activities for the selected hour
      const activitiesInHour = activityDataRaw.filter(activity => {
        const date = new Date(activity['Date/Time']);
        return date.getHours() === selectedHour;
      });

      return (
        <Card>
          <CardHeader>
            <CardTitle>Activities at Hour {selectedHour}:00</CardTitle>
          </CardHeader>
          <CardContent>
            <button onClick={() => setSelectedHour(null)} className="text-blue-500 underline mb-4">
              Back to Activity Timeline
            </button>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-2">Time</th>
                    <th className="px-4 py-2">Guard</th>
                    <th className="px-4 py-2">Activity</th>
                    <th className="px-4 py-2">Location Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {activitiesInHour.map((activity, index) => (
                    <tr key={index}>
                      <td className="px-4 py-2">{activity['Date/Time']}</td>
                      <td className="px-4 py-2">{activity['User Name']}</td>
                      <td className="px-4 py-2">{activity['Activity']}</td>
                      <td className="px-4 py-2">{activity['Location Accuracy']}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (selectedLocation !== null) {
      // Show detailed stats for the selected location
      const locationActivities = activityDataRaw.filter(activity => {
        return activity['Post Name'] === selectedLocation;
      });

      return (
        <Card>
          <CardHeader>
            <CardTitle>Details for {selectedLocation}</CardTitle>
          </CardHeader>
          <CardContent>
            <button onClick={() => setSelectedLocation(null)} className="text-blue-500 underline mb-4">
              Back to Location Performance
            </button>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-2">Time</th>
                    <th className="px-4 py-2">Guard</th>
                    <th className="px-4 py-2">Activity</th>
                    <th className="px-4 py-2">Location Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {locationActivities.map((activity, index) => (
                    <tr key={index}>
                      <td className="px-4 py-2">{activity['Date/Time']}</td>
                      <td className="px-4 py-2">{activity['User Name']}</td>
                      <td className="px-4 py-2">{activity['Activity']}</td>
                      <td className="px-4 py-2">{activity['Location Accuracy']}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      );
    }

    return null;
  };

  // Guard Performance Card Component
  const GuardPerformanceCard: React.FC<{ guard: GuardStats }> = ({ guard }) => (
    <Card className={guard.status === 'warning' ? 'border-red-500' : ''}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{guard.name}</h3>
            <p className="text-sm text-gray-500">{guard.post}</p>
          </div>
          <Badge variant={guard.status === 'warning' ? 'destructive' : 'secondary'}>
            {guard.status === 'warning' ? 'Issues Detected' : 'Normal'}
          </Badge>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Location Accuracy</p>
            <p className="text-lg font-semibold">{guard.locationAccuracy}m</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Activities</p>
            <p className="text-lg font-semibold">{guard.activities}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Missed Scans</p>
            <p className="text-lg font-semibold">{guard.missedScans}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Location Issues</p>
            <p className="text-lg font-semibold">{guard.locationIssues}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // Activity Timeline Chart Component
  const ActivityTimeline: React.FC = () => (
    <Card>
      <CardHeader>
        <CardTitle>Activity Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={activityData} onClick={(e) => {
              if (e && e.activeLabel != null) {
                setSelectedHour(Number(e.activeLabel));
              }
            }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="count" stroke="#3B82F6" name="Activities" />
              <Line type="monotone" dataKey="locationIssues" stroke="#EF4444" name="Location Issues" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );

  // Location Stats Chart Component
  const LocationStatsChart: React.FC = () => (
    <Card>
      <CardHeader>
        <CardTitle>Location Performance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={locationStats} onClick={(e) => {
              if (e && e.activeLabel) {
                setSelectedLocation(e.activeLabel);
              }
            }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="totalScans" fill="#3B82F6" name="Total Scans" />
              <Bar dataKey="accuracyIssues" fill="#EF4444" name="Accuracy Issues" />
              <Bar dataKey="coverageRate" fill="#10B981" name="Coverage Rate %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header with Date Range Picker */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Security Guard Management</h1>
            <p className="text-gray-500">Real-time monitoring and analytics</p>
          </div>
          <div className="flex items-center space-x-4 mt-4 md:mt-0">
            <DatePicker
              selected={startDate}
              onChange={(dates: [Date | null, Date | null] | null) => {
                if (dates) {
                  const [start, end] = dates;
                  setStartDate(start || undefined);
                  setEndDate(end || undefined);
                } else {
                  setStartDate(undefined);
                  setEndDate(undefined);
                }
              }}
              startDate={startDate}
              endDate={endDate}
              selectsRange
              isClearable={true}
              className="rounded-lg border border-gray-300 text-sm p-2"
              placeholderText="Select date range"
            />
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search guards, posts, or incidents..."
            className="pl-10 pr-4 py-2 w-full rounded-lg border border-gray-300"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-4 mb-6">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as typeof activeTab)}
            className={`flex items-center px-4 py-2 rounded-lg ${
              activeTab === id ? 'bg-blue-500 text-white' : 'bg-white hover:bg-gray-50'
            }`}
          >
            <Icon className="w-4 h-4 mr-2" />
            {label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="space-y-6">
        {/* Metrics Cards with Colors */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-blue-100">
            <CardContent className="p-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Guards</p>
                  <p className="text-2xl font-bold">{metrics.totalGuards}</p>
                </div>
                <User className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-green-100">
            <CardContent className="p-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-500">On-Time Rate</p>
                  <p className="text-2xl font-bold">{metrics.onTimeRate}%</p>
                </div>
                <Clock className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-red-100">
            <CardContent className="p-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-500">Location Issues</p>
                  <p className="text-2xl font-bold">{metrics.locationErrors}</p>
                </div>
                <MapPin className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-yellow-100">
            <CardContent className="p-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-500">Missed Scans</p>
                  <p className="text-2xl font-bold">{metrics.missedScans}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Conditional Content Based on Active Tab */}
        {activeTab === 'overview' && (
          <>
            {/* Charts or Drill-Down Content */}
            {selectedHour !== null || selectedLocation !== null ? (
              renderDrillDownContent()
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ActivityTimeline />
                <LocationStatsChart />
              </div>
            )}

            {/* Alerts */}
            {metrics.locationErrors > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Location Accuracy Issues</AlertTitle>
                <AlertDescription>
                  {metrics.locationErrors} location accuracy issues detected. Average accuracy: {metrics.avgLocationAccuracy}m
                </AlertDescription>
              </Alert>
            )}
          </>
        )}

        {activeTab === 'guards' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {guardStats
              .filter(guard =>
                guard.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                guard.post.toLowerCase().includes(searchTerm.toLowerCase())
              )
              .map(guard => (
                <GuardPerformanceCard key={guard.id} guard={guard} />
              ))}
          </div>
        )}

        {activeTab === 'locations' && (
          <>
            {selectedLocation !== null ? (
              renderDrillDownContent()
            ) : (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Location Coverage</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Scans</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Coverage Rate</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Accuracy Issues</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {locationStats
                            .filter(location =>
                              location.name.toLowerCase().includes(searchTerm.toLowerCase())
                            )
                            .map((location, index) => (
                              <tr
                                key={index}
                                className="cursor-pointer hover:bg-gray-100"
                                onClick={() => setSelectedLocation(location.name)}
                              >
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                  {location.name}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {location.totalScans}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {location.coverageRate}%
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {location.accuracyIssues}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SecurityDashboard;
