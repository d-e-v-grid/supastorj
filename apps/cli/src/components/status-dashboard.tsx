/**
 * Status Dashboard - Interactive TUI component for service monitoring
 */

import Table from 'ink-table';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import React, { useState, useEffect } from 'react';

import { ServiceStatus, ServiceAdapter } from '../types/index.js';

interface ServiceInfo {
  name: string;
  status: ServiceStatus;
  health: string;
  uptime?: string;
  cpu?: string;
  memory?: string;
}

interface StatusDashboardProps {
  services: ServiceAdapter[];
  refreshInterval?: number;
}

export const StatusDashboard: React.FC<StatusDashboardProps> = ({
  services,
  refreshInterval = 5000,
}) => {
  const [serviceInfo, setServiceInfo] = useState<ServiceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    const fetchStatus = async () => {
      const info: ServiceInfo[] = [];

      for (const service of services) {
        try {
          const status = await service.status();
          const health = await service.healthcheck();

          info.push({
            name: service.name,
            status,
            health: health.healthy ? '✅ Healthy' : '❌ Unhealthy',
            uptime: status === ServiceStatus.Running ? 'N/A' : '-',
            cpu: 'N/A',
            memory: 'N/A',
          });
        } catch (error) {
          info.push({
            name: service.name,
            status: ServiceStatus.Unknown,
            health: '❓ Unknown',
            uptime: '-',
            cpu: '-',
            memory: '-',
          });
        }
      }

      setServiceInfo(info);
      setLoading(false);
      setLastUpdated(new Date());
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, refreshInterval);

    return () => clearInterval(interval);
  }, [services, refreshInterval]);


  const getStatusEmoji = (status: ServiceStatus): string => {
    switch (status) {
      case ServiceStatus.Running:
        return '🟢';
      case ServiceStatus.Stopped:
        return '🔴';
      case ServiceStatus.Starting:
        return '🟡';
      case ServiceStatus.Stopping:
        return '🟠';
      case ServiceStatus.Error:
        return '❌';
      default:
        return '❓';
    }
  };

  if (loading) {
    return (
      <Box flexDirection="column" paddingTop={1}>
        <Box>
          <Text color="cyan">
            <Spinner type="dots" /> Loading service status...
          </Text>
        </Box>
      </Box>
    );
  }

  const tableData = serviceInfo.map(info => ({
    Service: info.name,
    Status: `${getStatusEmoji(info.status)} ${info.status}`,
    Health: info.health,
    CPU: info.cpu,
    Memory: info.memory,
    Uptime: info.uptime,
  }));

  return (
    <Box flexDirection="column" paddingTop={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          🚀 Supastorj Service Status
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Table data={tableData} />
      </Box>

      <Box>
        <Text dimColor>
          Last updated: {lastUpdated.toLocaleTimeString()} • Refreshing every {refreshInterval / 1000}s
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Press 'q' to quit, 'r' to refresh
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Get status color based on service status
 */
const getStatusColor = (status: ServiceStatus): string => {
  switch (status) {
    case ServiceStatus.Running:
      return 'green';
    case ServiceStatus.Stopped:
      return 'red';
    case ServiceStatus.Starting:
    case ServiceStatus.Stopping:
      return 'yellow';
    default:
      return 'gray';
  }
};

/**
 * Service status row component
 */
export const ServiceRow: React.FC<{ service: ServiceInfo }> = ({ service }) => {
  const statusColor = getStatusColor(service.status);

  return (
    <Box>
      <Box width={20}>
        <Text>{service.name}</Text>
      </Box>
      <Box width={15}>
        <Text color={statusColor}>{service.status}</Text>
      </Box>
      <Box width={15}>
        <Text>{service.health}</Text>
      </Box>
      <Box width={10}>
        <Text>{service.cpu}</Text>
      </Box>
      <Box width={10}>
        <Text>{service.memory}</Text>
      </Box>
      <Box width={15}>
        <Text>{service.uptime}</Text>
      </Box>
    </Box>
  );
};