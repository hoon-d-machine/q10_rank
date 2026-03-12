import streamlit as st
import pandas as pd
import plotly.express as px
from supabase import create_client
from datetime import datetime, timedelta
import requests
# ==============================================================================
# [1] 기본 설정 및 연결
# ==============================================================================
st.set_page_config(page_title="Qoo10 메가와리 인사이트", layout="wide", page_icon="📊")
#브랜드 설정 유지
if "selected_brands" not in st.session_state:
    st.session_state.selected_brands = []

try:
    SUPABASE_URL = st.secrets["SUPABASE_URL"]
    SUPABASE_KEY = st.secrets["SUPABASE_KEY"]
except:
    st.error("Secrets 설정이 필요합니다.")
    st.stop()

@st.cache_resource
def init_connection():
    return create_client(SUPABASE_URL, SUPABASE_KEY)

supabase = init_connection()

@st.cache_data
def convert_df(df):
    return df.to_csv(index=False).encode('utf-8-sig')

# ==============================================================================
# [2] 데이터 로드
# ==============================================================================
@st.cache_data(ttl=60) 
def load_data():
    all_data = []
    start = 0
    batch_size = 1000
    
    while True:
        response = supabase.table("qoo10_rankings").select("*").order("collected_at", desc=True).range(start, start + batch_size - 1).execute()
        if not response.data: break
        all_data.extend(response.data)
        if len(response.data) < batch_size: break
        start += batch_size
        
    df = pd.DataFrame(all_data)
    og_df = df.copy()
    if not df.empty:
        # 숫자형 변환
        df['rank'] = pd.to_numeric(df['rank'], errors='coerce')
        df['sale_price'] = pd.to_numeric(df['sale_price'], errors='coerce')
        df['review_count'] = pd.to_numeric(df['review_count'], errors='coerce')
        
        # 시간 변환
        df['collected_at'] = pd.to_datetime(df['collected_at'])
        df['collected_at'] = df['collected_at'] + pd.Timedelta(hours=9)
        
        df['display_time'] = df['collected_at'].dt.strftime('%m/%d %H시')
        df['date_only'] = df['collected_at'].dt.date
        
        cols = ['large_category', 'medium_category', 'small_category', 'brand']
        df[cols] = df[cols].fillna("기타")
        
    return df, og_df

# ==============================================================================
# [3] 메인 화면 로직
# ==============================================================================
def trigger_github_action():
    # Secrets에서 정보 가져오기
    token = st.secrets["GITHUB_TOKEN"]
    owner = st.secrets["GITHUB_OWNER"]
    repo = st.secrets["GITHUB_REPO"]
    workflow_file = "main.yml" # GitHub에 올린 yml 파일 이름
    
    url = f"https://api.github.com/repos/{owner}/{repo}/actions/workflows/{workflow_file}/dispatches"
    
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    data = {"ref": "main"}
    
    response = requests.post(url, headers=headers, json=data)
    
    if response.status_code == 204:
        st.sidebar.success("✅ 수집 명령을 보냈습니다! (약 3~5분 소요)")
    else:
        st.sidebar.error(f"❌ 실행 실패: {response.status_code} - {response.text}")
        
st.title("📊 Qoo10 메가와리 랭킹 인사이트")

with st.spinner('데이터 분석 중...'):
    df, og_df = load_data()

if df.empty:
    st.warning("데이터가 없습니다. 수집기를 먼저 실행해주세요.")
else:
    # --- 사이드바 필터 ---
    st.sidebar.header("🔍 기본 필터")

    events = sorted(df['event_sid'].unique(), reverse=True)
    events.insert(0, "전체 (All Events)")
    sel_event = st.sidebar.selectbox("행사(SID)", events, index=0)
    if sel_event != "전체 (All Events)":
        df = df[df['event_sid'] == sel_event]

    r_types = df['rank_type'].unique()
    sel_type = st.sidebar.selectbox("랭킹 기준", r_types)
    df = df[df['rank_type'] == sel_type]

    cats = df['category'].unique()
    sel_cat = st.sidebar.selectbox("타겟(연령/카테고리)", cats)
    df = df[df['category'] == sel_cat]
    
    # 기간 설정
    st.sidebar.divider()
    st.sidebar.subheader("📅 기간 설정")
    min_date = df['date_only'].min()
    max_date = df['date_only'].max()
    date_range = st.sidebar.date_input("조회 기간", value=(min_date, max_date), min_value=min_date, max_value=max_date)
    
    if len(date_range) == 2:
        start_d, end_d = date_range
        df = df[(df['date_only'] >= start_d) & (df['date_only'] <= end_d)]
    
    # 상위 N개
    st.sidebar.divider()
    st.sidebar.subheader("📊 시각화 옵션")
    top_n_options = [5, 10, 15, 20, 30, 50, "전체"]
    top_n = st.sidebar.selectbox("상위 N개 항목만 보기", top_n_options, index=1)

    # 브랜드
    all_brands = sorted(df['brand'].unique())
    sel_brands = st.sidebar.multiselect("브랜드 직접 선택 (옵션)", all_brands)
    
    if sel_brands:
        final_df = df[df['brand'].isin(sel_brands)]
    else:
        final_df = df
        
    if st.sidebar.button("🚀 데이터 수집 즉시 실행"):
        trigger_github_action()

    if st.sidebar.button("🔄 데이터 즉시 새로고침"):
        st.cache_data.clear()
        st.rerun()

    st.sidebar.markdown("---")
    file_label = sel_event if sel_event != "전체 (All Events)" else "All_Events"
    st.sidebar.download_button("🔍 현재 데이터 받기", convert_df(final_df), "filtered_data.csv", "text/csv")
    st.sidebar.write("")
    st.sidebar.download_button("💾 전체 원본 받기", convert_df(og_df), f"Raw_{file_label}.csv", "text/csv")

    # ==========================================================================
    # [4] 시각화
    # ==========================================================================
    st.divider()
    
    def filter_top_n(dataframe, group_col, n_limit):
        if n_limit == "전체": return dataframe
        top_items = dataframe.groupby(group_col)['rank'].min().sort_values().head(n_limit).index.tolist()
        return dataframe[dataframe[group_col].isin(top_items)]

    tab1, tab2, tab3 = st.tabs(["📈 순위 트렌드", "💰 가격/리뷰 분석", "🔲 카테고리 점유율"])

    with tab1:
        col1, col2 = st.columns(2)
        
        # 1. 브랜드별
        with col1:
            st.subheader(f"🏢 브랜드 Top {top_n} 순위")
            if not final_df.empty:
                chart_df = filter_top_n(final_df, 'brand', top_n)
                brand_trend = chart_df.groupby(['collected_at', 'display_time', 'brand'])['rank'].min().reset_index().sort_values('collected_at')
                sorted_brands = brand_trend.groupby('brand')['rank'].min().sort_values().index.tolist()
                
                fig = px.line(
                    brand_trend, x='collected_at', y='rank', color='brand',
                    markers=True, title="브랜드별 최고 순위 흐름",
                    category_orders={"brand": sorted_brands},
                    hover_data={"collected_at": "|%m/%d %H시"}
                )
                fig.update_yaxes(autorange="reversed", title="순위")
                fig.update_xaxes(tickformat="%m/%d %H시", title="수집 시간")
                fig.update_traces(connectgaps=True)
                
                fig.update_layout(
                    height=600, 
                    legend=dict(
                        orientation="v", 
                        yanchor="top", y=1, 
                        xanchor="left", x=1.02,
                        itemsizing='constant', font=dict(size=10)
                    )
                )
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.info("데이터가 없습니다.")

        # 2. 상품별
        with col2:
            st.subheader(f"📦 상품 Top {top_n} 순위")
            if not final_df.empty:
                chart_df = filter_top_n(final_df, 'goods_no', top_n)
                chart_df = chart_df.sort_values('collected_at')
                
                last_names = chart_df.sort_values('collected_at').groupby('goods_no')['goods_name'].last().to_dict()
                chart_df['unified_name'] = chart_df['goods_no'].map(last_names)

                def make_legend_label(row):
                    name = row['unified_name']
                    g_no = str(row['goods_no'])
                    short_name = name[:10] + '..' if len(name) > 10 else name
                    return f"{short_name} (#{g_no[-4:]})"

                chart_df['legend_label'] = chart_df.apply(make_legend_label, axis=1)
                sorted_labels = chart_df.groupby('legend_label')['rank'].min().sort_values().index.tolist()
                
                if not chart_df.empty:
                    fig = px.line(
                        chart_df, x="collected_at", y="rank", color="legend_label",
                        hover_name="unified_name",
                        hover_data={
                            "brand": True, "sale_price": True, 
                            "legend_label": False, "collected_at": "|%m/%d %H시"
                        },
                        markers=True, title="개별 상품 순위 흐름",
                        category_orders={"legend_label": sorted_labels}
                    )
                    fig.update_yaxes(autorange="reversed", title="순위")
                    fig.update_xaxes(tickformat="%m/%d %H시", title="수집 시간")
                    fig.update_traces(connectgaps=True)
                    
                    fig.update_layout(
                        height=600, 
                        showlegend=True,
                        legend=dict(
                            orientation="v",
                            yanchor="top", y=1,
                            xanchor="left", x=1.02,
                            itemsizing='constant', font=dict(size=10)
                        )
                    )
                    st.plotly_chart(fig, use_container_width=True)
                else:
                    st.info("조건에 맞는 상품 데이터가 없습니다.")
            else:
                st.info("데이터가 없습니다.")

    with tab2:
        col3, col4 = st.columns(2)
        with col3:
            st.subheader("🔵 가격 vs 리뷰 (Top 상품)")
            if not final_df.empty:
                chart_df = filter_top_n(final_df, 'goods_name', top_n)
                chart_df = chart_df.sort_values('collected_at') \
                                   .drop_duplicates(subset=['goods_no'], keep='last')
                if not chart_df.empty:
                    fig = px.scatter(
                        chart_df, x="sale_price", y="rank", 
                        size="review_count", color="medium_category",
                        hover_data=["goods_name", "brand", "goods_no", "display_time"],
                        title=f"가격 분포와 순위 (상위 {top_n}개)"
                    )
                    fig.update_yaxes(autorange="reversed")
                    st.plotly_chart(fig, use_container_width=True)
                else: st.info("표시할 데이터가 부족합니다.")
        with col4:
            st.subheader("💰 카테고리별 가격대")
            if not final_df.empty:
                fig = px.box(
                    final_df, x="medium_category", y="sale_price", 
                    color="medium_category", points="all",
                    title="중분류별 가격 범위"
                )
                st.plotly_chart(fig, use_container_width=True)

    with tab3:
        col5, col6 = st.columns(2)
        with col5:
            st.subheader("🔲 카테고리 점유율")
            if not final_df.empty:
                fig = px.treemap(
                    final_df, 
                    path=[px.Constant("전체"), 'large_category', 'medium_category', 'brand'], 
                    values='sale_price', color='medium_category',
                    color_discrete_sequence=px.colors.qualitative.Pastel
                )
                st.plotly_chart(fig, use_container_width=True)
        with col6:
            st.subheader("☀️ 세부 계층 구조")
            if not final_df.empty:
                fig = px.sunburst(
                    final_df,
                    path=['large_category', 'medium_category', 'small_category'],
                    values='sale_price', color='medium_category',
                    color_discrete_sequence=px.colors.qualitative.Pastel
                )
                st.plotly_chart(fig, use_container_width=True)

    st.divider()
    with st.expander("📋 필터링된 데이터 원본 보기"):
        view_cols = ['display_time', 'rank', 'brand', 'goods_name', 'sale_price', 'review_count', 'large_category']
        st.dataframe(
            final_df.sort_values(by=['collected_at', 'rank'])[view_cols],
            use_container_width=True, hide_index=True
        )














