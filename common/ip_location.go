package common

import (
	_ "embed"
	"fmt"
	"net"
	"strings"
	"sync"

	"github.com/lionsoul2014/ip2region/binding/golang/xdb"
)

//go:embed geo/ip2region.xdb
var ip2regionXdb []byte

var (
	searcherOnce sync.Once
	searcher     *xdb.Searcher
	initErr      error
)

func getIPSearcher() *xdb.Searcher {
	searcherOnce.Do(func() {
		// 完全基于内存的查询（加载整个 xdb 到内存），高并发下无锁开销
		searcher, initErr = xdb.NewWithBuffer(xdb.IPv4, ip2regionXdb)
		if initErr != nil {
			SysError("init ip2region searcher failed: " + initErr.Error())
		}
	})
	return searcher
}

// GetIPLocation 返回格式化后的 IP 归属地（如「中国·北京市」），
// 内网 IP、解析失败或未知归属地返回空字符串。
func GetIPLocation(ipStr string) string {
	ip := net.ParseIP(ipStr)
	if ip == nil || ip.IsLoopback() || ip.IsPrivate() || !ip.IsGlobalUnicast() {
		return ""
	}

	s := getIPSearcher()
	if s == nil || initErr != nil {
		return ""
	}

	// xdb 数据文件仅含 IPv4；IPv4-mapped IPv6 地址先还原为 IPv4
	ipv4 := ip.To4()
	if ipv4 == nil {
		return ""
	}

	region, err := s.Search(ipv4)
	if err != nil || region == "" {
		return ""
	}

	return formatIPRegion(region)
}

// formatIPRegion 将 ip2region 的「国家|区域|省|市|ISP」格式化为「国家·省市」。
// 仅在归属国家为中国时输出，与现有日志 IP 展示场景对齐。
func formatIPRegion(region string) string {
	parts := strings.Split(region, "|")
	for i, p := range parts {
		if p == "0" {
			parts[i] = ""
		}
	}
	if len(parts) < 5 {
		return ""
	}
	country, province, city := parts[0], parts[2], parts[3]
	if country != "中国" || province == "" {
		return ""
	}
	if province == city || city == "" {
		return fmt.Sprintf("中国·%s", province)
	}
	return fmt.Sprintf("中国·%s%s", province, city)
}
