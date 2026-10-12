package common

import (
	_ "embed"
	"fmt"
	"net"
	"strings"
	"sync"

	"github.com/lionsoul2014/ip2region/binding/golang/xdb"
)

// ip2regionXdb 是 ip2region 离线数据文件，字段格式为「国家|省|市|ISP|ISO」。
// 来源 github.com/lionsoul2014/ip2region 的 data/ip2region_v4.xdb，
// SHA256 f5ccf366678c91394ac5e469f93b624d5df290e7353c748b920c6b84ffc4e551。
// 更新数据文件后须同步更新此行并重跑 common 包的归属地测试。
//
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

	// Search 的类型分支只接受 string 与 []byte；net.IP 是 []byte 的命名类型，
	// 直接传入会落入 default 分支报 invalid ip value type，故转回 string。
	region, err := s.Search(ipv4.String())
	if err != nil || region == "" {
		return ""
	}

	return formatIPRegion(region)
}

// formatIPRegion 将 ip2region 的「国家|省|市|ISP|ISO」格式化为「国家·省市」。
// 仅在归属国家为中国时输出，与现有日志 IP 展示场景对齐。
func formatIPRegion(region string) string {
	parts := strings.Split(region, "|")
	for i, p := range parts {
		if p == "0" {
			parts[i] = ""
		}
	}
	// 至少需要国家、省、市三个字段才能拼出可读归属地
	if len(parts) < 3 {
		return ""
	}
	country, province, city := parts[0], parts[1], parts[2]
	if country != "中国" || province == "" {
		return ""
	}
	if province == city || city == "" {
		return fmt.Sprintf("中国·%s", province)
	}
	return fmt.Sprintf("中国·%s%s", province, city)
}
